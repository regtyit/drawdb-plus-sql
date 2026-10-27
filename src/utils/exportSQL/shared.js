import { isFunction, isKeyword, getRelationshipFields } from "../utils";

import { DB } from "../../data/constants";
import { dbToTypes } from "../../data/datatypes";

export function getFkColumnNames(relationship, startTable, endTable) {
  const pairs = getRelationshipFields(relationship);
  const startColumns = pairs.map(
    (p) => startTable?.fields.find((f) => f.id === p.startFieldId)?.name,
  );
  const endColumns = pairs.map(
    (p) => endTable?.fields.find((f) => f.id === p.endFieldId)?.name,
  );
  return { startColumns, endColumns };
}

export function parseDefault(field, database = DB.GENERIC) {
  if (typeof field.default !== "string") {
    return field.default;
  }

  const typeInfo = dbToTypes[database][field.type];
  if (
    isFunction(field.default) ||
    isKeyword(field.default) ||
    (typeInfo && !typeInfo.hasQuotes) ||
    isExpressionDefault(field.default)
  ) {
    return field.default;
  }

  return `'${escapeQuotes(field.default)}'`;
}

/**
 * A default string that is already a self-sufficient SQL expression and must
 * be emitted verbatim instead of being wrapped in quotes again:
 * fully-quoted literals ('x'), cast expressions ('{}'::jsonb), ARRAY[...].
 */
function isExpressionDefault(value) {
  const trimmed = value.trim();
  if (trimmed.length < 2) return false;
  return (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    trimmed.includes("::") ||
    /^ARRAY\[/i.test(trimmed)
  );
}

export function escapeQuotes(str) {
  return str.replace(/[']/g, "'$&");
}

export function exportFieldComment(comment) {
  if (typeof comment !== "string" || comment === "") {
    return "";
  }

  return comment
    .split("\n")
    .map((commentLine) => `\t-- ${commentLine}\n`)
    .join("");
}

export function uniqueConstraintClause(table, quote) {
  const constraints = (table.uniqueConstraints || []).filter(
    (uc) => Array.isArray(uc.fields) && uc.fields.length > 0,
  );
  if (constraints.length === 0) return "";

  return (
    ",\n" +
    constraints
      .map(
        (uc) =>
          `\tCONSTRAINT ${quote(uc.name)} UNIQUE (${uc.fields
            .map((f) => quote(f))
            .join(", ")})`,
      )
      .join(",\n")
  );
}

export function getInlineFK(table, obj) {
  let fks = [];
  obj.references.forEach((r) => {
    if (r.startTableId === table.id) {
      const endTable = obj.tables.find((t) => t.id === r.endTableId);
      const { startColumns, endColumns } = getFkColumnNames(r, table, endTable);
      fks.push(
        `\tFOREIGN KEY (${startColumns
          .map((c) => `"${c}"`)
          .join(", ")}) REFERENCES "${endTable?.name}"(${endColumns
          .map((c) => `"${c}"`)
          .join(
            ", ",
          )})\n\tON UPDATE ${r.updateConstraint.toUpperCase()} ON DELETE ${r.deleteConstraint.toUpperCase()}`,
      );
    }
  });
  return fks.join(",\n");
}
