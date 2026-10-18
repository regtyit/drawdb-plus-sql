import axios from "axios";
import { postgresApiUrl, postgresApiToken } from "../config";

const client = axios.create({
  baseURL: postgresApiUrl,
  headers: {
    "Content-Type": "application/json",
    ...(postgresApiToken ? { "x-drawdb-token": postgresApiToken } : {}),
  },
  timeout: 60000,
});

export class PostgresApiError extends Error {
  constructor(payload) {
    super(payload?.message || "PostgreSQL request failed");
    this.name = "PostgresApiError";
    this.code = payload?.code ?? null;
    this.detail = payload?.detail ?? null;
    this.hint = payload?.hint ?? null;
    this.position = payload?.position ?? null;
    this.severity = payload?.severity ?? null;
    this.schema = payload?.schema ?? null;
    this.table = payload?.table ?? null;
    this.column = payload?.column ?? null;
    this.constraint = payload?.constraint ?? null;
  }
}

async function post(path, body) {
  let res;
  try {
    res = await client.post(path, body);
  } catch (e) {
    const payload = e?.response?.data?.error ?? {
      message:
        e?.code === "ERR_NETWORK"
          ? "Cannot reach the PostgreSQL API server. Is it running?"
          : e?.message,
    };
    throw new PostgresApiError(payload);
  }
  if (!res.data?.ok) {
    throw new PostgresApiError(res.data?.error);
  }
  return res.data;
}

export const testConnection = (connection) =>
  post("/api/postgres/test", { connection });

export const runQuery = (connection, sql, options = {}) =>
  post("/api/postgres/query", {
    connection,
    sql,
    params: options.params,
    maxRows: options.maxRows,
  });

export const getSchemas = (connection) =>
  post("/api/postgres/schemas", { connection });

export const introspectSchema = (connection, schemas) =>
  post("/api/postgres/schema", { connection, schemas });

export const dropSchema = (connection, schema) =>
  post("/api/postgres/schema/drop", { connection, schema });

export const listTables = (connection, schemas) =>
  post("/api/postgres/tables", { connection, schemas });

export const fetchRows = (connection, params) =>
  post("/api/postgres/rows", { connection, ...params });

export const insertRow = (connection, params) =>
  post("/api/postgres/rows/insert", { connection, ...params });

export const updateRow = (connection, params) =>
  post("/api/postgres/rows/update", { connection, ...params });

export const deleteRow = (connection, params) =>
  post("/api/postgres/rows/delete", { connection, ...params });
