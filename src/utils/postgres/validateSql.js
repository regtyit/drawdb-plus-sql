/**
 * Validate generated SQL against the live database without changing anything.
 * The statements run inside a transaction that is always rolled back, so DDL
 * is fully checked (types, constraints, names) and then undone.
 */
import { runQuery } from "../../api/postgres";
import { quoteIdentifier, schemaSearchPath } from "./schemaPath";

export async function validateSql(connection, sql) {
  const schema = connection?.schema?.trim();
  const prefix = "BEGIN;\n";
  const schemaPreamble =
    schema && schema !== "public"
      ? `CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schema)};\n`
      : "";
  const script = `${prefix}${schemaPreamble}${sql}\nROLLBACK;`;
  try {
    return await runQuery(connection, script, {
      searchPath: schemaSearchPath(schema),
    });
  } catch (error) {
    // The API reports positions relative to the full script we sent. Map them
    // back to the user's DDL so the context snippet points at the right spot.
    const position = Number.parseInt(error?.position, 10);
    if (Number.isFinite(position)) {
      error.position = String(
        Math.max(0, position - prefix.length - schemaPreamble.length),
      );
    }
    throw error;
  }
}
