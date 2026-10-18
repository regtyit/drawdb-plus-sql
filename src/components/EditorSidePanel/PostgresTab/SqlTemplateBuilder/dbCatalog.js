import { listTables } from "../../../../api/postgres";

/**
 * Load tables and their column names from the connected database so the
 * template forms can offer friendly autocomplete suggestions.
 * Returns [] when anything fails (suggestions are optional).
 */
export async function fetchDbTableCatalog(connection) {
  try {
    const schemas = connection?.schema ? [connection.schema] : undefined;
    const res = await listTables(connection, schemas);
    return (res.tables ?? []).map((table) => ({
      name: table.name,
      columns: (table.columns ?? []).map((column) => column.name),
    }));
  } catch {
    return [];
  }
}

/** Column names of a table from the catalog, e.g. for WHERE suggestions. */
export function columnsForTable(tables, tableName) {
  const match = (tables ?? []).find(
    (t) =>
      t.name ===
      String(tableName ?? "")
        .trim()
        .split(".")
        .pop(),
  );
  return match ? match.columns : [];
}
