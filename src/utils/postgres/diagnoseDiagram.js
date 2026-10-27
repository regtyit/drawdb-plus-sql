import { Cardinality } from "../../data/constants";
import { getRelationshipFields } from "../utils";

function fieldById(table, id) {
  return (table?.fields ?? []).find((field) => field.id === id);
}

function columnSetKey(columns) {
  return [...columns].sort().join("\u0000");
}

function uniqueColumnSets(table) {
  if (!table) return [];
  const sets = [];
  const primary = (table.fields ?? [])
    .filter((field) => field.primary)
    .map((field) => field.name);
  if (primary.length > 0) sets.push(primary);
  for (const field of table.fields ?? []) {
    if (field.unique) sets.push([field.name]);
  }
  for (const constraint of table.uniqueConstraints ?? []) {
    if (constraint.fields?.length) sets.push(constraint.fields);
  }
  for (const index of table.indices ?? []) {
    if (index.unique && index.fields?.length) sets.push(index.fields);
  }
  return sets;
}

export function isUniqueColumnSet(table, columns) {
  if (!table || !columns?.length) return false;
  const key = columnSetKey(columns);
  return uniqueColumnSets(table).some((set) => columnSetKey(set) === key);
}

function referencesTable(check, tables) {
  const qualified = /\b([A-Za-z_][A-Za-z0-9_$]*)\.([A-Za-z_][A-Za-z0-9_$]*)\b/g;
  const names = new Set(tables.map((table) => table.name));
  const refs = new Set();
  let match;
  while ((match = qualified.exec(check)) !== null) {
    if (names.has(match[1])) refs.add(match[1]);
  }
  return [...refs];
}

function hasSubquery(check) {
  return /\b(SELECT|FROM|JOIN|EXISTS)\b/i.test(check);
}

/**
 * Detect diagram constructs that PostgreSQL's DDL cannot express. These are
 * detected before contacting the server so the user gets an actionable
 * explanation and a one-click repair instead of a raw syntax error.
 */
export function diagnoseDiagram({ tables = [], relationships = [] } = {}) {
  const issues = [];

  for (const table of tables) {
    for (const field of table.fields ?? []) {
      const check = String(field.check ?? "").trim();
      if (!check) continue;
      const refs = referencesTable(check, tables);
      if (refs.length > 0 || hasSubquery(check)) {
        issues.push({
          kind: "unsupported_check",
          tableId: table.id,
          fieldId: field.id,
          tableName: table.name,
          fieldName: field.name,
          check,
          references: refs.filter((name) => name !== table.name),
          sameTable: refs.includes(table.name),
          subquery: hasSubquery(check),
        });
      }
    }
  }

  for (const relationship of relationships) {
    const startTable = tables.find((t) => t.id === relationship.startTableId);
    const endTable = tables.find((t) => t.id === relationship.endTableId);
    if (!startTable || !endTable) continue;

    const pairs = getRelationshipFields(relationship);
    const startFields = pairs
      .map((pair) => fieldById(startTable, pair.startFieldId))
      .filter(Boolean);
    const endFields = pairs
      .map((pair) => fieldById(endTable, pair.endFieldId))
      .filter(Boolean);
    if (!startFields.length || !endFields.length) continue;

    const startColumns = startFields.map((field) => field.name);
    const endColumns = endFields.map((field) => field.name);
    if (isUniqueColumnSet(endTable, endColumns)) continue;

    // A foreign key must point at a primary key or a unique constraint. If
    // the relationship is drawn from the referenced side, swapping the two
    // ends makes it valid without losing any information.
    const canSwap = isUniqueColumnSet(startTable, startColumns);
    issues.push({
      kind: "fk_not_unique",
      relationshipId: relationship.id,
      startTableName: startTable.name,
      endTableName: endTable.name,
      startColumns,
      endColumns,
      canSwap,
    });
  }

  return issues;
}

export function swapCardinality(cardinality) {
  if (cardinality === Cardinality.MANY_TO_ONE) return Cardinality.ONE_TO_MANY;
  if (cardinality === Cardinality.ONE_TO_MANY) return Cardinality.MANY_TO_ONE;
  return cardinality;
}

/**
 * Values that reverse a relationship so the current start table becomes the
 * referenced (parent) side.
 */
export function reverseRelationship(relationship) {
  const pairs = getRelationshipFields(relationship);
  const reversed = pairs.map((pair) => ({
    startFieldId: pair.endFieldId,
    endFieldId: pair.startFieldId,
  }));
  const values = {
    startTableId: relationship.endTableId,
    endTableId: relationship.startTableId,
    startFieldId: reversed[0].startFieldId,
    endFieldId: reversed[0].endFieldId,
    cardinality: swapCardinality(relationship.cardinality),
  };
  if (Array.isArray(relationship.fields) && relationship.fields.length > 0) {
    values.fields = reversed;
  }
  return values;
}
