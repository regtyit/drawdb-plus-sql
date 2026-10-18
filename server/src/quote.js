export function quoteIdent(name) {
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("Invalid identifier");
  }
  return `"${name.replace(/"/g, '""')}"`;
}

export function qualifiedName(schema, table) {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`;
}
