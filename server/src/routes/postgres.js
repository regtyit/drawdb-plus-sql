import { Router } from "express";
import { runQuery, testConnection, normalizeError, withClient } from "../db.js";
import { introspect, getSchemas } from "../introspect.js";
import { quoteIdent, qualifiedName } from "../quote.js";

export const postgresRouter = Router();

const CONNECTION_KEYS = ["host", "port", "user", "password", "database", "ssl"];

function pickConnection(rawConnection) {
  const connection = {};
  if (!rawConnection || typeof rawConnection !== "object") {
    throw new Error("Missing connection configuration");
  }
  for (const key of CONNECTION_KEYS) {
    if (key in rawConnection) connection[key] = rawConnection[key];
  }
  if (!connection.host) throw new Error("Connection host is required");
  if (!connection.user) throw new Error("Connection user is required");
  if (!connection.database) throw new Error("Connection database is required");
  return connection;
}

function handle(fn) {
  return async (req, res) => {
    try {
      const data = await fn(req);
      res.json({ ok: true, ...data });
    } catch (err) {
      res.status(200).json({ ok: false, error: normalizeError(err) });
    }
  };
}

postgresRouter.post(
  "/test",
  handle(async (req) => {
    const connection = pickConnection(req.body?.connection);
    const info = await testConnection(connection);
    return { connectionInfo: info };
  }),
);

postgresRouter.post(
  "/query",
  handle(async (req) => {
    const connection = pickConnection(req.body?.connection);
    const sql = req.body?.sql;
    if (typeof sql !== "string" || sql.trim() === "") {
      throw new Error("SQL statement is empty");
    }
    const params = Array.isArray(req.body?.params) ? req.body.params : [];
    const maxRows = Number.isInteger(req.body?.maxRows)
      ? req.body.maxRows
      : undefined;
    return runQuery(connection, sql, {
      params,
      maxRows,
      searchPath: req.body?.searchPath,
    });
  }),
);

postgresRouter.post(
  "/schemas",
  handle(async (req) => {
    const connection = pickConnection(req.body?.connection);
    const schemas = await getSchemas(connection);
    return { schemas };
  }),
);

/**
 * Database management works through a "maintenance" connection (the default
 * `postgres` database) so it does not depend on the database selected in the
 * connect form. Falls back to `template1` for clusters where `postgres` does
 * not exist.
 */
const MAINTENANCE_DATABASES = ["postgres", "template1"];

const CONNECTION_META_KEYS = ["host", "port", "user", "password", "ssl"];

async function withMaintenanceClient(rawConnection, fn) {
  const connection = {};
  for (const key of CONNECTION_META_KEYS) {
    if (key in rawConnection) connection[key] = rawConnection[key];
  }
  if (!connection.host) throw new Error("Connection host is required");
  if (!connection.user) throw new Error("Connection user is required");
  let lastError;
  for (const database of MAINTENANCE_DATABASES) {
    try {
      return await withClient({ ...connection, database }, fn);
    } catch (err) {
      lastError = err;
      if (err?.code !== "3D000") throw err;
    }
  }
  throw lastError;
}

const DATABASE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/;

function pickMaintenanceConnection(body) {
  if (!body?.connection || typeof body.connection !== "object") {
    throw new Error("Missing connection configuration");
  }
  return body.connection;
}

postgresRouter.post(
  "/databases",
  handle(async (req) => {
    const connection = pickMaintenanceConnection(req.body);
    const { rows } = await withMaintenanceClient(connection, (client) =>
      client.query(
        `SELECT datname AS name,
                pg_get_userbyid(datdba) AS owner,
                pg_encoding_to_char(encoding) AS encoding
         FROM pg_database
         WHERE NOT datistemplate
         ORDER BY datname`,
      ),
    );
    return {
      databases: rows.map((row) => ({
        name: row.name,
        owner: row.owner,
        encoding: row.encoding,
      })),
    };
  }),
);

postgresRouter.post(
  "/databases/create",
  handle(async (req) => {
    const connection = pickMaintenanceConnection(req.body);
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!DATABASE_NAME_PATTERN.test(name)) {
      throw new Error(
        `Invalid database name "${name}". Use letters, digits and underscores, starting with a letter or underscore.`,
      );
    }
    // CREATE DATABASE cannot run inside a transaction block, and the name is
    // never parameterizable (utility statement), hence the quoted identifier.
    await withMaintenanceClient(connection, (client) =>
      client.query(`CREATE DATABASE ${quoteIdent(name)}`),
    );
    return { name };
  }),
);

postgresRouter.post(
  "/schema",
  handle(async (req) => {
    const connection = pickConnection(req.body?.connection);
    const schemas = Array.isArray(req.body?.schemas)
      ? req.body.schemas
      : undefined;
    const catalog = await introspect(connection, { schemas });
    return { catalog };
  }),
);

postgresRouter.post(
  "/schema/drop",
  handle(async (req) => {
    const connection = pickConnection(req.body?.connection);
    const schema = req.body?.schema;
    if (typeof schema !== "string" || schema === "") {
      throw new Error("A schema name is required");
    }

    const { views, matviews, tables, types } = await withClient(
      connection,
      async (client) => {
        const [v, mv, t, ty] = await Promise.all([
          client.query(
            "SELECT viewname AS name FROM pg_views WHERE schemaname = $1",
            [schema],
          ),
          client.query(
            "SELECT matviewname AS name FROM pg_matviews WHERE schemaname = $1",
            [schema],
          ),
          client.query(
            "SELECT tablename AS name FROM pg_tables WHERE schemaname = $1",
            [schema],
          ),
          client.query(
            `SELECT t.typname AS name
             FROM pg_type t
             JOIN pg_namespace n ON n.oid = t.typnamespace
             LEFT JOIN pg_class c ON c.oid = t.typrelid
             WHERE n.nspname = $1
               AND (t.typtype = 'e' OR (t.typtype = 'c' AND c.relkind = 'c'))`,
            [schema],
          ),
        ]);
        return {
          views: v.rows.map((r) => r.name),
          matviews: mv.rows.map((r) => r.name),
          tables: t.rows.map((r) => r.name),
          types: ty.rows.map((r) => r.name),
        };
      },
    );

    const statements = [
      ...views.map(
        (n) => `DROP VIEW IF EXISTS ${qualifiedName(schema, n)} CASCADE;`,
      ),
      ...matviews.map(
        (n) =>
          `DROP MATERIALIZED VIEW IF EXISTS ${qualifiedName(schema, n)} CASCADE;`,
      ),
      ...tables.map(
        (n) => `DROP TABLE IF EXISTS ${qualifiedName(schema, n)} CASCADE;`,
      ),
      ...types.map(
        (n) => `DROP TYPE IF EXISTS ${qualifiedName(schema, n)} CASCADE;`,
      ),
    ];

    if (statements.length === 0) {
      return { dropped: 0, results: [], notices: [], executionTimeMs: 0 };
    }

    const { results, notices, executionTimeMs } = await runQuery(
      connection,
      statements.join("\n"),
    );
    return { dropped: statements.length, results, notices, executionTimeMs };
  }),
);

postgresRouter.post(
  "/tables",
  handle(async (req) => {
    const connection = pickConnection(req.body?.connection);
    const schemas = Array.isArray(req.body?.schemas)
      ? req.body.schemas
      : undefined;
    const catalog = await introspect(connection, { schemas });
    const pkByTable = new Map(
      catalog.primaryKeys.map((pk) => [`${pk.schema}.${pk.table}`, pk.columns]),
    );
    const tables = catalog.tables
      .filter((t) => t.kind === "r" || t.kind === "p")
      .map((t) => ({
        schema: t.schema,
        name: t.name,
        comment: t.comment,
        columns: t.columns,
        primaryKey: pkByTable.get(`${t.schema}.${t.name}`) ?? [],
      }));
    return { tables, schemas: catalog.schemas };
  }),
);

async function findTable(connection, schema, table) {
  const catalog = await introspect(connection, { schemas: [schema] });
  const target = catalog.tables.find(
    (t) => t.schema === schema && t.name === table,
  );
  if (!target) throw new Error(`Table "${schema}.${table}" was not found`);
  const pk =
    catalog.primaryKeys.find((p) => p.schema === schema && p.table === table)
      ?.columns ?? [];
  return { table: target, primaryKey: pk };
}

function assertColumns(columns, names) {
  const valid = new Set(columns.map((c) => c.name));
  for (const name of names) {
    if (!valid.has(name)) {
      throw new Error(`Unknown column "${name}"`);
    }
  }
}

postgresRouter.post(
  "/rows",
  handle(async (req) => {
    const connection = pickConnection(req.body?.connection);
    const { schema, table } = req.body ?? {};
    if (!schema || !table) throw new Error("schema and table are required");
    const limit = Math.min(Math.max(Number(req.body?.limit) || 100, 1), 1000);
    const offset = Math.max(Number(req.body?.offset) || 0, 0);
    const { table: meta, primaryKey } = await findTable(
      connection,
      schema,
      table,
    );

    let orderBy = "";
    const requestedOrder = Array.isArray(req.body?.orderBy)
      ? req.body.orderBy.filter((c) =>
          meta.columns.some((col) => col.name === c),
        )
      : [];
    const orderColumns = requestedOrder.length ? requestedOrder : primaryKey;
    if (orderColumns.length) {
      orderBy = ` ORDER BY ${orderColumns.map(quoteIdent).join(", ")}`;
    }

    const selectSql = `SELECT * FROM ${qualifiedName(schema, table)}${orderBy} LIMIT $1 OFFSET $2`;
    const countSql = `SELECT count(*)::text AS total FROM ${qualifiedName(schema, table)}`;

    const [selectRes, countRes] = await Promise.all([
      runQuery(connection, selectSql, { params: [limit, offset] }),
      runQuery(connection, countSql),
    ]);

    return {
      columns: meta.columns,
      primaryKey,
      rows: selectRes.results[0]?.rows ?? [],
      total: Number(countRes.results[0]?.rows?.[0]?.total ?? 0),
      limit,
      offset,
    };
  }),
);

postgresRouter.post(
  "/rows/insert",
  handle(async (req) => {
    const connection = pickConnection(req.body?.connection);
    const { schema, table, values } = req.body ?? {};
    if (!schema || !table) throw new Error("schema and table are required");
    if (!values || typeof values !== "object") {
      throw new Error("values object is required");
    }
    const { table: meta } = await findTable(connection, schema, table);
    const columns = Object.keys(values);
    if (columns.length === 0) throw new Error("No values provided");
    assertColumns(meta.columns, columns);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
    const sql = `INSERT INTO ${qualifiedName(schema, table)} (${columns
      .map(quoteIdent)
      .join(", ")}) VALUES (${placeholders}) RETURNING *`;
    const params = columns.map((c) => values[c]);
    const { results } = await runQuery(connection, sql, { params });
    return {
      rows: results[0]?.rows ?? [],
      rowCount: results[0]?.rowCount ?? 0,
    };
  }),
);

postgresRouter.post(
  "/rows/update",
  handle(async (req) => {
    const connection = pickConnection(req.body?.connection);
    const { schema, table, values, primaryKey } = req.body ?? {};
    if (!schema || !table) throw new Error("schema and table are required");
    if (
      !values ||
      typeof values !== "object" ||
      Object.keys(values).length === 0
    ) {
      throw new Error("values object is required");
    }
    if (
      !primaryKey ||
      typeof primaryKey !== "object" ||
      Object.keys(primaryKey).length === 0
    ) {
      throw new Error("primaryKey object is required");
    }
    const { table: meta } = await findTable(connection, schema, table);
    const valueColumns = Object.keys(values);
    const pkColumns = Object.keys(primaryKey);
    assertColumns(meta.columns, [...valueColumns, ...pkColumns]);
    const setClause = valueColumns
      .map((c, i) => `${quoteIdent(c)} = $${i + 1}`)
      .join(", ");
    const whereClause = pkColumns
      .map((c, i) => `${quoteIdent(c)} = $${valueColumns.length + i + 1}`)
      .join(" AND ");
    const sql = `UPDATE ${qualifiedName(schema, table)} SET ${setClause} WHERE ${whereClause} RETURNING *`;
    const params = [
      ...valueColumns.map((c) => values[c]),
      ...pkColumns.map((c) => primaryKey[c]),
    ];
    const { results } = await runQuery(connection, sql, { params });
    return {
      rows: results[0]?.rows ?? [],
      rowCount: results[0]?.rowCount ?? 0,
    };
  }),
);

postgresRouter.post(
  "/rows/delete",
  handle(async (req) => {
    const connection = pickConnection(req.body?.connection);
    const { schema, table, primaryKey } = req.body ?? {};
    if (!schema || !table) throw new Error("schema and table are required");
    if (
      !primaryKey ||
      typeof primaryKey !== "object" ||
      Object.keys(primaryKey).length === 0
    ) {
      throw new Error("primaryKey object is required");
    }
    const { table: meta } = await findTable(connection, schema, table);
    const pkColumns = Object.keys(primaryKey);
    assertColumns(meta.columns, pkColumns);
    const whereClause = pkColumns
      .map((c, i) => `${quoteIdent(c)} = $${i + 1}`)
      .join(" AND ");
    const sql = `DELETE FROM ${qualifiedName(schema, table)} WHERE ${whereClause} RETURNING *`;
    const params = pkColumns.map((c) => primaryKey[c]);
    const { results } = await runQuery(connection, sql, { params });
    return {
      rows: results[0]?.rows ?? [],
      rowCount: results[0]?.rowCount ?? 0,
    };
  }),
);
