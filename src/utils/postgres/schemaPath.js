/**
 * Quote a single PostgreSQL identifier (schema/table/column name).
 */
export function quoteIdentifier(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/**
 * Build the `search_path` value used for executing diagram SQL against the
 * schema selected in the connection form. PostgreSQL silently skips schemas
 * that do not exist, so `public` is kept as a fallback for extension types.
 */
export function schemaSearchPath(schema) {
  const value = typeof schema === "string" ? schema.trim() : "";
  if (!value) return null;
  return `${quoteIdentifier(value)}, public`;
}
