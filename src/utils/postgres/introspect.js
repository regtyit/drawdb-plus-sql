import { nanoid } from "nanoid";
import { Cardinality, DB } from "../../data/constants";
import { dbToTypes } from "../../data/datatypes";

const PG_TYPE_ALIASES = {
  smallint: "SMALLINT",
  int2: "SMALLINT",
  integer: "INTEGER",
  int: "INTEGER",
  int4: "INTEGER",
  bigint: "BIGINT",
  int8: "BIGINT",
  decimal: "DECIMAL",
  numeric: "NUMERIC",
  real: "REAL",
  float4: "REAL",
  "double precision": "DOUBLE PRECISION",
  float8: "DOUBLE PRECISION",
  smallserial: "SMALLSERIAL",
  serial2: "SMALLSERIAL",
  serial: "SERIAL",
  serial4: "SERIAL",
  bigserial: "BIGSERIAL",
  serial8: "BIGSERIAL",
  money: "MONEY",
  character: "CHAR",
  char: "CHAR",
  bpchar: "CHAR",
  "character varying": "VARCHAR",
  varchar: "VARCHAR",
  text: "TEXT",
  bytea: "BYTEA",
  date: "DATE",
  time: "TIME",
  "time without time zone": "TIME",
  "time with time zone": "TIMETZ",
  timetz: "TIMETZ",
  timestamp: "TIMESTAMP",
  "timestamp without time zone": "TIMESTAMP",
  "timestamp with time zone": "TIMESTAMPTZ",
  timestamptz: "TIMESTAMPTZ",
  interval: "INTERVAL",
  boolean: "BOOLEAN",
  bool: "BOOLEAN",
  point: "POINT",
  line: "LINE",
  lseg: "LSEG",
  box: "BOX",
  path: "PATH",
  polygon: "POLYGON",
  circle: "CIRCLE",
  cidr: "CIDR",
  inet: "INET",
  macaddr: "MACADDR",
  macaddr8: "MACADDR8",
  bit: "BIT",
  "bit varying": "VARBIT",
  varbit: "VARBIT",
  tsvector: "TSVECTOR",
  tsquery: "TSQUERY",
  json: "JSON",
  jsonb: "JSONB",
  uuid: "UUID",
  xml: "XML",
};

const postgresTypes = dbToTypes[DB.POSTGRES];

function resolveTypeName(name) {
  if (postgresTypes[name]) return name;
  const alias = PG_TYPE_ALIASES[name.toLowerCase()];
  if (alias && postgresTypes[alias]) return alias;
  return null;
}

function parseTypeColumn(column, customTypes) {
  const raw = column.dataType ?? "";
  const isArray = /\[\]/.test(raw) || Boolean(column.isArray);
  const noArray = raw.replace(/\[\]/g, "");
  const sizeMatch = noArray.match(/\(([^)]*)\)/);
  const size = sizeMatch ? sizeMatch[1].replace(/\s+/g, "") : "";
  const base = noArray.replace(/\([^)]*\)/, "").trim();

  const custom = customTypes.get(base.toLowerCase());
  if (custom) {
    return { type: custom, size: "", isArray };
  }

  let type = resolveTypeName(base);
  if (!type) {
    type = base.toUpperCase();
  }
  return { type, size, isArray };
}

function mapDefault(column) {
  if (column.identity) return { default: "", increment: true };
  const raw = column.default;
  if (!raw) return { default: "", increment: false };
  const lower = raw.toLowerCase();
  if (lower.startsWith("nextval(")) return { default: "", increment: true };
  let value = raw.replace(/::[a-zA-Z0-9_ ]+(\([^)]*\))?(\[\])?$/, "").trim();
  const stringLiteral = value.match(/^'(.*)'$/s);
  if (stringLiteral) {
    value = stringLiteral[1].replace(/''/g, "'");
  }
  return { default: value, increment: false };
}

function tableKey(schema, name) {
  return `${schema}.${name}`;
}

export function catalogToDiagram(catalog) {
  const customTypes = new Map();
  for (const e of catalog.enums ?? [])
    customTypes.set(e.name.toLowerCase(), e.name);
  for (const t of catalog.types ?? [])
    customTypes.set(t.name.toLowerCase(), t.name);

  const pkByTable = new Map(
    (catalog.primaryKeys ?? []).map((pk) => [
      tableKey(pk.schema, pk.table),
      new Set(pk.columns),
    ]),
  );
  const uniqueByTable = new Map();
  for (const u of catalog.uniques ?? []) {
    const key = tableKey(u.schema, u.table);
    if (!uniqueByTable.has(key)) uniqueByTable.set(key, new Set());
    if (u.columns.length === 1) uniqueByTable.get(key).add(u.columns[0]);
  }
  const indexesByTable = new Map();
  const uniqueConstraintNames = new Set(
    (catalog.uniques ?? []).map(
      (u) => `${tableKey(u.schema, u.table)}.${u.name}`,
    ),
  );
  for (const idx of catalog.indexes ?? []) {
    const key = tableKey(idx.schema, idx.table);
    if (!indexesByTable.has(key)) indexesByTable.set(key, []);
    indexesByTable.get(key).push(idx);
    if (
      idx.unique &&
      idx.columns.length === 1 &&
      !uniqueConstraintNames.has(`${key}.${idx.name}`)
    ) {
      if (!uniqueByTable.has(key)) uniqueByTable.set(key, new Set());
      uniqueByTable.get(key).add(idx.columns[0]);
    }
  }

  const hasEnums = true;
  const hasTypes = true;

  const tables = (catalog.tables ?? []).map((t) => {
    const key = tableKey(t.schema, t.name);
    const pks = pkByTable.get(key) ?? new Set();
    const uniques = uniqueByTable.get(key) ?? new Set();

    const fields = t.columns.map((col) => {
      const { type, size, isArray } = parseTypeColumn(col, customTypes);
      const { default: defaultValue, increment } = mapDefault(col);
      const field = {
        id: nanoid(),
        name: col.name,
        type,
        default: defaultValue,
        check: "",
        primary: pks.has(col.name),
        unique: uniques.has(col.name),
        notNull: Boolean(col.notNull),
        increment,
        comment: col.comment ?? "",
      };
      if (size !== "") field.size = size;
      if (isArray) field.isArray = true;
      return field;
    });

    const indices = (indexesByTable.get(key) ?? [])
      .filter((idx) => !uniqueConstraintNames.has(`${key}.${idx.name}`))
      .map((idx) => ({
        name: idx.name,
        unique: Boolean(idx.unique),
        fields: idx.columns,
      }));

    const uniqueConstraints = (catalog.uniques ?? [])
      .filter((u) => tableKey(u.schema, u.table) === key)
      .map((u) => ({ name: u.name, fields: u.columns }));

    return {
      id: nanoid(),
      name: t.name,
      comment: t.comment ?? "",
      color: "#175e7a",
      x: 0,
      y: 0,
      locked: false,
      collapsed: false,
      fields,
      indices,
      uniqueConstraints,
    };
  });

  const tablesByKey = new Map();
  (catalog.tables ?? []).forEach((t, index) => {
    tablesByKey.set(tableKey(t.schema, t.name), tables[index]);
  });

  const relationships = [];
  for (const fk of catalog.foreignKeys ?? []) {
    const start = tablesByKey.get(tableKey(fk.schema, fk.table));
    const end = tablesByKey.get(tableKey(fk.refSchema, fk.refTable));
    if (!start || !end) continue;
    const fieldPairs = [];
    let valid = true;
    for (let i = 0; i < fk.columns.length; i += 1) {
      const startField = start.fields.find((f) => f.name === fk.columns[i]);
      const endField = end.fields.find((f) => f.name === fk.refColumns[i]);
      if (!startField || !endField) {
        valid = false;
        break;
      }
      fieldPairs.push({ startFieldId: startField.id, endFieldId: endField.id });
    }
    if (!valid || fieldPairs.length === 0) continue;

    const localUniques =
      uniqueByTable.get(tableKey(fk.schema, fk.table)) ?? new Set();
    const isUnique = fk.columns.every((c) => localUniques.has(c));

    relationships.push({
      id: nanoid(),
      name: `fk_${fk.table}_${fk.columns[0]}_${fk.refTable}`,
      startTableId: start.id,
      startFieldId: fieldPairs[0].startFieldId,
      endTableId: end.id,
      endFieldId: fieldPairs[0].endFieldId,
      fields: fieldPairs,
      cardinality: isUnique ? Cardinality.ONE_TO_ONE : Cardinality.MANY_TO_ONE,
      updateConstraint: fk.onUpdate,
      deleteConstraint: fk.onDelete,
      color: "#808080",
    });
  }

  const columnCount = Math.max(Math.ceil(Math.sqrt(tables.length)), 1);
  tables.forEach((table, index) => {
    table.x = 120 + (index % columnCount) * 340;
    table.y = 120 + Math.floor(index / columnCount) * 340;
  });

  const enums = (catalog.enums ?? []).map((e) => ({
    id: nanoid(),
    name: e.name,
    values: e.values,
  }));

  const types = (catalog.types ?? []).map((t) => ({
    id: nanoid(),
    name: t.name,
    comment: "",
    fields: t.fields.map((f) => ({
      id: nanoid(),
      name: f.name,
      type:
        resolveTypeName(f.type.replace(/\([^)]*\)/, "").trim()) ??
        f.type.toUpperCase(),
    })),
  }));

  return {
    tables,
    relationships,
    enums: hasEnums ? enums : [],
    types: hasTypes ? types : [],
    views: [],
    skippedViews: (catalog.views ?? []).map((v) => v.name),
  };
}
