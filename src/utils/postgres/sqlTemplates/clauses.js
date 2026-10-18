import { quoteIdent, sqlValue, quoteString, splitList } from "./value";

/** Single column definition from a form row. */
export function columnDefinition(column) {
  if (!column?.name) return "";
  const type = (column.type || "TEXT").trim();
  const args = (column.args || "").trim();
  let sql = `${quoteIdent(column.name)} ${type}${args ? `(${args})` : ""}`;
  if (column.notNull) sql += " NOT NULL";
  if (column.unique) sql += " UNIQUE";
  if (column.default !== undefined && String(column.default).trim() !== "") {
    sql += ` DEFAULT ${sqlValue(column.default)}`;
  }
  return sql;
}

/** Full column list for CREATE TABLE, collapsing multi-column primary keys into a table constraint. */
export function buildColumns(columns = []) {
  const defined = columns.filter((c) => c && c.name);
  const primary = defined.filter((c) => c.primary);
  const lines = defined.map((c) => {
    let sql = columnDefinition(c);
    if (c.primary && primary.length === 1) sql += " PRIMARY KEY";
    return `  ${sql}`;
  });
  if (primary.length > 1) {
    lines.push(
      `  PRIMARY KEY (${primary.map((c) => quoteIdent(c.name)).join(", ")})`,
    );
  }
  return lines.join(",\n");
}

/** One WHERE-fragments from a condition row. */
export function conditionSql(condition) {
  if (!condition?.column) return "";
  const op = (condition.operator || "=").toUpperCase();
  const column = quoteIdent(condition.column);
  if (op === "IS NULL" || op === "IS NOT NULL") return `${column} ${op}`;
  if (op === "IN" || op === "NOT IN") {
    const items = splitList(condition.value).map(sqlValue);
    return `${column} ${op} (${items.join(", ")})`;
  }
  if (op === "BETWEEN") return `${column} BETWEEN ${condition.value ?? ""}`;
  return `${column} ${op} ${sqlValue(condition.value)}`;
}

export function whereClause(conditions = []) {
  const parts = conditions.map(conditionSql).filter(Boolean);
  return parts.length ? `WHERE ${parts.join(" AND ")}` : "";
}

export function orderClause(order = []) {
  const parts = order
    .filter((o) => o && o.column)
    .map(
      (o) => `${quoteIdent(o.column)} ${(o.direction || "ASC").toUpperCase()}`,
    );
  return parts.length ? `ORDER BY ${parts.join(", ")}` : "";
}

export function assignmentSql(items = []) {
  return items
    .filter((a) => a && a.column)
    .map((a) => `${quoteIdent(a.column)} = ${sqlValue(a.value)}`)
    .join(", ");
}

/** jsonb access expression, e.g. payload->>'user' (text) or payload->'user' (jsonb). */
export function jsonbAccess(column, path, textValue = true) {
  const access = textValue ? "->>" : "->";
  const segments = splitList(path).map((segment) => quoteString(segment));
  if (!segments.length) return quoteIdent(column);
  return `${quoteIdent(column)}${access}${segments.join(access)}`;
}

/** jsonb path as a text[] array literal used by jsonb_set(), e.g. "user.status" -> ARRAY['user','status']. */
export function jsonbPathLiteral(path) {
  const parts = String(path ?? "")
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => `'${segment.replace(/'/g, "''")}'`);
  return `ARRAY[${parts.join(", ")}]`;
}
