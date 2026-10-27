/* global process, Buffer */
import pg from "pg";

const { Pool } = pg;

const TYPE_NAMES = {
  16: "boolean",
  17: "bytea",
  18: "char",
  19: "name",
  20: "int8",
  21: "int2",
  23: "int4",
  25: "text",
  26: "oid",
  114: "json",
  142: "xml",
  600: "point",
  601: "lseg",
  602: "path",
  603: "box",
  604: "polygon",
  628: "line",
  650: "cidr",
  700: "float4",
  701: "float8",
  718: "circle",
  790: "money",
  829: "macaddr",
  869: "inet",
  1042: "bpchar",
  1043: "varchar",
  1082: "date",
  1083: "time",
  1114: "timestamp",
  1184: "timestamptz",
  1186: "interval",
  1266: "timetz",
  1560: "bit",
  1562: "varbit",
  1700: "numeric",
  2950: "uuid",
  3802: "jsonb",
  774: "macaddr8",
};

const MAX_ROWS = Number.parseInt(
  process.env.POSTGRES_API_MAX_ROWS ?? "5000",
  10,
);
const STATEMENT_TIMEOUT = Number.parseInt(
  process.env.POSTGRES_API_STATEMENT_TIMEOUT ?? "30000",
  10,
);
const POOL_IDLE = Number.parseInt(
  process.env.POSTGRES_API_POOL_IDLE ?? "60000",
  10,
);

/** @type {Map<string, { pool: import("pg").Pool, lastUsed: number }>} */
const pools = new Map();

function poolKey(connection) {
  return [
    connection.host,
    connection.port,
    connection.user,
    connection.database,
    connection.ssl ? "ssl" : "nossl",
    connection.password ?? "",
  ].join("|");
}

function buildConfig(connection) {
  const config = {
    host: connection.host,
    port: Number(connection.port) || 5432,
    user: connection.user,
    database: connection.database,
    max: 5,
    idleTimeoutMillis: POOL_IDLE,
    connectionTimeoutMillis: 15000,
    application_name: "drawdb",
  };
  if (connection.password) config.password = connection.password;
  if (connection.ssl) {
    config.ssl =
      connection.ssl === true ? { rejectUnauthorized: false } : connection.ssl;
  }
  if (STATEMENT_TIMEOUT > 0) {
    config.options = `-c statement_timeout=${STATEMENT_TIMEOUT}`;
  }
  return config;
}

export function getPool(connection) {
  const key = poolKey(connection);
  let entry = pools.get(key);
  if (!entry) {
    const pool = new Pool(buildConfig(connection));
    // Prevent unhandled 'error' events from idle clients killing the process.
    pool.on("error", () => {});
    entry = { pool, lastUsed: Date.now() };
    pools.set(key, entry);
  }
  entry.lastUsed = Date.now();
  return entry.pool;
}

export async function closeAllPools() {
  const closing = [...pools.values()].map((entry) => entry.pool.end());
  pools.clear();
  await Promise.allSettled(closing);
}

function serializeValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return `\\x${value.toString("hex")}`;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  return value;
}

function serializeRow(row) {
  const out = {};
  for (const key of Object.keys(row)) {
    out[key] = serializeValue(row[key]);
  }
  return out;
}

function normalizeResult(result, maxRows) {
  const allRows = result.rows ?? [];
  const truncated = maxRows > 0 && allRows.length > maxRows;
  const rows = (truncated ? allRows.slice(0, maxRows) : allRows).map(
    serializeRow,
  );
  return {
    command: result.command ?? null,
    rowCount: typeof result.rowCount === "number" ? result.rowCount : null,
    fields: (result.fields ?? []).map((field) => ({
      name: field.name,
      dataTypeID: field.dataTypeID,
      dataTypeName: TYPE_NAMES[field.dataTypeID] ?? null,
    })),
    rows,
    truncated,
  };
}

export function normalizeError(err) {
  return {
    message: err?.message ?? String(err),
    code: err?.code ?? null,
    detail: err?.detail ?? null,
    hint: err?.hint ?? null,
    position: err?.position ?? null,
    severity: err?.severity ?? null,
    schema: err?.schema ?? null,
    table: err?.table ?? null,
    column: err?.column ?? null,
    constraint: err?.constraint ?? null,
  };
}

/**
 * Execute arbitrary SQL against the given PostgreSQL connection.
 * Uses the simple query protocol when no parameters are supplied, which means
 * multi-statement scripts (including transaction control) are supported.
 */
export async function runQuery(connection, sql, options = {}) {
  const params = options.params ?? [];
  const maxRows = options.maxRows ?? MAX_ROWS;
  const searchPath =
    typeof options.searchPath === "string" && options.searchPath.trim() !== ""
      ? options.searchPath.trim()
      : null;
  const pool = getPool(connection);
  const client = await pool.connect();
  const notices = [];
  const onNotice = (notice) =>
    notices.push({
      severity: notice.severity,
      message: notice.message,
      detail: notice.detail ?? null,
      hint: notice.hint ?? null,
      code: notice.code ?? null,
    });
  client.on("notice", onNotice);
  const startedAt = Date.now();
  let previousSearchPath = null;
  try {
    if (searchPath) {
      // Remember the session value so this pooled client does not leak the
      // target schema into the next request.
      const { rows } = await client.query("SHOW search_path");
      previousSearchPath = rows[0]?.search_path ?? null;
      await client.query("SELECT set_config('search_path', $1, false)", [
        searchPath,
      ]);
    }
    const raw =
      params.length > 0
        ? await client.query({ text: sql, values: params })
        : await client.query(sql);
    const executionTimeMs = Date.now() - startedAt;
    const results = (Array.isArray(raw) ? raw : [raw]).map((result) =>
      normalizeResult(result, maxRows),
    );
    // A script may open a transaction without closing it (e.g. hand-written
    // BEGIN without COMMIT). Returning that client to the pool with an open
    // transaction leaks its locks and state to the next borrower.
    await cleanupTransaction(client, sql);
    return { results, notices, executionTimeMs };
  } catch (err) {
    // A failed batch inside a transaction leaves the client in an aborted
    // state ("current transaction is aborted...") which would poison the
    // pool. Always try to roll back on failure; harmless if no transaction.
    try {
      await client.query("ROLLBACK");
    } catch {
      /* no open transaction */
    }
    throw err;
  } finally {
    if (previousSearchPath !== null) {
      try {
        await client.query("SELECT set_config('search_path', $1, false)", [
          previousSearchPath,
        ]);
      } catch {
        /* client already gone */
      }
    }
    client.removeListener("notice", onNotice);
    client.release();
  }
}

/**
 * Roll back only when the executed script explicitly opened a transaction
 * and did not finish it itself, so intentional BEGIN…COMMIT scripts and
 * statements outside transactions are untouched.
 */
async function cleanupTransaction(client, sql) {
  if (
    !/\bBEGIN\b/i.test(sql) ||
    /\bCOMMIT\b/i.test(sql) ||
    /\bROLLBACK\b/i.test(sql)
  ) {
    return;
  }
  try {
    await client.query("ROLLBACK");
  } catch {
    /* no open transaction */
  }
}

export async function runSequence(connection, steps, options = {}) {
  const results = [];
  for (const step of steps) {
    results.push(
      await runQuery(connection, step.sql, { ...options, params: step.params }),
    );
  }
  return results;
}

export async function withClient(connection, fn) {
  const pool = getPool(connection);
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function testConnection(connection) {
  const pool = getPool(connection);
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      "SELECT version() AS version, current_database() AS database, current_user AS username, now() AS server_time",
    );
    return {
      version: rows[0]?.version ?? null,
      database: rows[0]?.database ?? null,
      username: rows[0]?.username ?? null,
      serverTime: serializeValue(rows[0]?.server_time ?? null),
    };
  } finally {
    client.release();
  }
}

// Periodically evict pools that have been idle for too long.
setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of pools) {
      if (now - entry.lastUsed > POOL_IDLE) {
        entry.pool.end().catch(() => {});
        pools.delete(key);
      }
    }
  },
  Math.max(POOL_IDLE, 30000),
).unref();

export { MAX_ROWS, STATEMENT_TIMEOUT };
