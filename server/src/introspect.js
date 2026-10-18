import { withClient } from "./db.js";

const UPDATE_DELETE = {
  a: "No action",
  r: "Restrict",
  c: "Cascade",
  n: "Set null",
  d: "Set default",
};

function mapAction(char) {
  return UPDATE_DELETE[char] ?? "No action";
}

const COLUMNS_SQL = `
  SELECT
    n.nspname AS schema,
    c.relname AS table,
    c.relkind AS relkind,
    a.attname AS name,
    a.attnum AS ordinal,
    format_type(a.atttypid, a.atttypmod) AS formatted_type,
    t.typname AS udt_name,
    t.typtype AS typ_type,
    a.attnotnull AS not_null,
    pg_get_expr(ad.adbin, ad.adrelid) AS default_expr,
    a.attidentity AS identity,
    a.attgenerated AS generated,
    col_description(c.oid, a.attnum) AS comment
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_type t ON t.oid = a.atttypid
  LEFT JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
  WHERE a.attnum > 0
    AND NOT a.attisdropped
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND n.nspname = ANY($1)
  ORDER BY n.nspname, c.relname, a.attnum
`;

const TABLE_COMMENTS_SQL = `
  SELECT n.nspname AS schema, c.relname AS table, obj_description(c.oid) AS comment
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND n.nspname = ANY($1)
    AND obj_description(c.oid) IS NOT NULL
`;

const CONSTRAINTS_SQL = `
  SELECT
    con.contype AS type,
    con.conname AS name,
    n.nspname AS schema,
    c.relname AS table,
    refn.nspname AS ref_schema,
    refc.relname AS ref_table,
    con.confupdtype AS on_update,
    con.confdeltype AS on_delete,
    (SELECT array_agg(a.attname::text ORDER BY k.ord)
       FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
       JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum) AS columns,
    (SELECT array_agg(a.attname::text ORDER BY k.ord)
       FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ord)
       JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum) AS ref_columns
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_class refc ON refc.oid = con.confrelid
  LEFT JOIN pg_namespace refn ON refn.oid = refc.relnamespace
  WHERE con.contype IN ('p', 'u', 'f')
    AND n.nspname = ANY($1)
  ORDER BY con.conname
`;

const INDEXES_SQL = `
  SELECT
    n.nspname AS schema,
    ic.relname AS table,
    ci.relname AS name,
    i.indisunique AS is_unique,
    (SELECT array_agg(a.attname::text ORDER BY k.ord)
       FROM unnest(i.indkey) WITH ORDINALITY k(attnum, ord)
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum) AS columns,
    (SELECT bool_or(k.attnum = 0) FROM unnest(i.indkey) AS k(attnum)) AS has_expression
  FROM pg_index i
  JOIN pg_class ic ON ic.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = ic.relnamespace
  JOIN pg_class ci ON ci.oid = i.indexrelid
  WHERE n.nspname = ANY($1)
    AND NOT i.indisprimary
    AND ic.relkind IN ('r', 'p', 'm')
  ORDER BY n.nspname, ic.relname, ci.relname
`;

const ENUMS_SQL = `
  SELECT n.nspname AS schema, t.typname AS name, e.enumlabel AS value
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = ANY($1)
  ORDER BY t.typname, e.enumsortorder
`;

const COMPOSITE_TYPES_SQL = `
  SELECT n.nspname AS schema, t.typname AS name, a.attname AS field_name,
         a.attnum AS ord, format_type(a.atttypid, a.atttypmod) AS field_type
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  JOIN pg_class c ON c.oid = t.typrelid
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  WHERE t.typtype = 'c'
    AND c.relkind = 'c'
    AND n.nspname = ANY($1)
  ORDER BY t.typname, a.attnum
`;

const VIEWS_SQL = `
  SELECT schemaname AS schema, viewname AS name, definition
  FROM pg_views
  WHERE schemaname = ANY($1)
`;

const MATERIALIZED_VIEWS_SQL = `
  SELECT schemaname AS schema, matviewname AS name, definition
  FROM pg_matviews
  WHERE schemaname = ANY($1)
`;

export async function getSchemas(connection) {
  const { rows } = await withClient(connection, (client) =>
    client.query(
      `SELECT nspname AS name
       FROM pg_namespace
       WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'
       ORDER BY nspname`,
    ),
  );
  return rows.map((r) => r.name);
}

export async function introspect(connection, options = {}) {
  let schemas = options.schemas;
  if (!schemas || schemas.length === 0) {
    schemas = await getSchemas(connection);
  }

  return withClient(connection, async (client) => {
    const [
      columns,
      tableComments,
      constraints,
      indexes,
      enums,
      composites,
      views,
      matviews,
    ] = await Promise.all([
      client.query(COLUMNS_SQL, [schemas]),
      client.query(TABLE_COMMENTS_SQL, [schemas]),
      client.query(CONSTRAINTS_SQL, [schemas]),
      client.query(INDEXES_SQL, [schemas]),
      client.query(ENUMS_SQL, [schemas]),
      client.query(COMPOSITE_TYPES_SQL, [schemas]),
      client.query(VIEWS_SQL, [schemas]),
      client.query(MATERIALIZED_VIEWS_SQL, [schemas]),
    ]);

    const commentByTable = new Map(
      tableComments.rows.map((r) => [`${r.schema}.${r.table}`, r.comment]),
    );

    const tablesByKey = new Map();
    for (const row of columns.rows) {
      const key = `${row.schema}.${row.table}`;
      if (!tablesByKey.has(key)) {
        tablesByKey.set(key, {
          schema: row.schema,
          name: row.table,
          kind: row.relkind,
          comment: commentByTable.get(key) ?? "",
          columns: [],
        });
      }
      const arrayMatch = /\[\]$/.test(row.formatted_type);
      tablesByKey.get(key).columns.push({
        name: row.name,
        ordinal: row.ordinal,
        dataType: row.formatted_type,
        udtName: row.udt_name,
        typeKind: row.typ_type,
        isArray: arrayMatch,
        notNull: row.not_null,
        default: row.default_expr,
        identity: row.identity,
        generated: row.generated,
        comment: row.comment ?? "",
      });
    }

    const primaryKeys = [];
    const uniques = [];
    const foreignKeys = [];
    for (const row of constraints.rows) {
      if (row.type === "p") {
        primaryKeys.push({
          schema: row.schema,
          table: row.table,
          columns: row.columns ?? [],
        });
      } else if (row.type === "u") {
        uniques.push({
          schema: row.schema,
          table: row.table,
          name: row.name,
          columns: row.columns ?? [],
        });
      } else if (row.type === "f") {
        foreignKeys.push({
          name: row.name,
          schema: row.schema,
          table: row.table,
          refSchema: row.ref_schema,
          refTable: row.ref_table,
          columns: row.columns ?? [],
          refColumns: row.ref_columns ?? [],
          onUpdate: mapAction(row.on_update),
          onDelete: mapAction(row.on_delete),
        });
      }
    }

    const indexesOut = indexes.rows
      .filter((r) => !r.has_expression && r.columns && r.columns.length)
      .map((r) => ({
        schema: r.schema,
        table: r.table,
        name: r.name,
        unique: r.is_unique,
        columns: r.columns,
      }));

    const enumsMap = new Map();
    for (const row of enums.rows) {
      const key = `${row.schema}.${row.name}`;
      if (!enumsMap.has(key)) {
        enumsMap.set(key, { schema: row.schema, name: row.name, values: [] });
      }
      enumsMap.get(key).values.push(row.value);
    }

    const typesMap = new Map();
    for (const row of composites.rows) {
      const key = `${row.schema}.${row.name}`;
      if (!typesMap.has(key)) {
        typesMap.set(key, { schema: row.schema, name: row.name, fields: [] });
      }
      typesMap
        .get(key)
        .fields.push({ name: row.field_name, type: row.field_type });
    }

    const viewsOut = [
      ...views.rows.map((r) => ({
        schema: r.schema,
        name: r.name,
        materialized: false,
        definition: r.definition,
      })),
      ...matviews.rows.map((r) => ({
        schema: r.schema,
        name: r.name,
        materialized: true,
        definition: r.definition,
      })),
    ];

    return {
      schemas,
      tables: [...tablesByKey.values()],
      primaryKeys,
      uniques,
      foreignKeys,
      indexes: indexesOut,
      enums: [...enumsMap.values()],
      types: [...typesMap.values()],
      views: viewsOut,
    };
  });
}
