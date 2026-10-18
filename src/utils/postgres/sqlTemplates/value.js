const ZERO_ARG_FUNCTIONS = new Set([
  "NOW()",
  "CURRENT_TIMESTAMP",
  "CURRENT_DATE",
  "CURRENT_TIME",
  "CURRENT_USER",
  "SESSION_USER",
  "LOCALTIME",
  "LOCALTIMESTAMP",
  "GEN_RANDOM_UUID()",
]);

/** Quote a possibly dotted identifier, e.g. `public.users` -> `"public"."users"`. */
export function quoteIdent(name) {
  const value = String(name ?? "").trim();
  if (!value) return "";
  return value
    .split(".")
    .filter((part) => part.length > 0)
    .map((part) => `"${part.replace(/"/g, '""')}"`)
    .join(".");
}

/** Turn a user value into a safe SQL literal (numbers/keywords pass through, text gets quoted). */
export function sqlValue(raw) {
  const value = String(raw ?? "").trim();
  if (value === "") return "NULL";
  if (/^-?\d+(\.\d+)?$/.test(value)) return value;
  if (/^(true|false|null)$/i.test(value)) return value.toUpperCase();
  if (/^'.*'$/.test(value)) return value;
  if (ZERO_ARG_FUNCTIONS.has(value.toUpperCase())) return value.toUpperCase();
  if (/^[A-Za-z_][A-Za-z0-9_]*\s*\(.*\)$/.test(value)) return value;
  if (value.startsWith("$")) return value;
  return `'${value.replace(/'/g, "''")}'`;
}

/** Escape a string for a single-quoted SQL literal. */
export function quoteString(raw) {
  return `'${String(raw ?? "").replace(/'/g, "''")}'`;
}

/** Split a comma separated string into trimmed parts. */
export function splitList(raw) {
  return String(raw ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Ensure a snippet ends with a semicolon. */
export function ensureSemicolon(sql) {
  const trimmed = String(sql ?? "").trim();
  if (!trimmed) return "";
  return trimmed.endsWith(";") ? trimmed : `${trimmed};`;
}

/** Strip a trailing semicolon. */
export function withoutSemicolon(sql) {
  return String(sql ?? "")
    .trim()
    .replace(/;$/, "");
}

/** Indent every non-empty line of a snippet. */
export function indentSql(sql, prefix = "  ") {
  return String(sql ?? "")
    .split("\n")
    .map((line) => (line.trim() ? `${prefix}${line}` : line))
    .join("\n");
}

/** Wrap statements (array or string) in a PL/pgSQL DO block. */
export function doBlock(statements) {
  const body = Array.isArray(statements)
    ? statements.join("\n")
    : String(statements ?? "");
  return `DO $$\nBEGIN\n${indentSql(body, "  ")}\nEND $$;`;
}
