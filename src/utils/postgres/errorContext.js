/**
 * Given SQL and a PostgreSQL error `position` (character offset into the full
 * statement string; arrives as a string through the API), return a short
 * readable snippet centered on the error. Used to make errors like
 * "syntax error at or near "x" @ 216" directly diagnosable in the UI.
 */
export function errorContext(sql, position, radius = 70) {
  const pos =
    typeof position === "string" ? Number.parseInt(position, 10) : position;
  if (typeof sql !== "string" || !Number.isFinite(pos) || pos < 0) {
    return null;
  }
  const start = Math.max(0, pos - radius);
  const end = Math.min(sql.length, pos + radius);
  let snippet = sql.slice(start, end);
  const prefix = start > 0 ? (snippet.startsWith("\n") ? "…" : "… ") : "";
  const suffix = end < sql.length ? "…" : "";
  snippet = snippet.replace(/\t/g, "  ").trimStart();
  return {
    snippet: `${prefix}${snippet}${suffix}`,
    line: sql.slice(0, pos).split("\n").length,
  };
}
