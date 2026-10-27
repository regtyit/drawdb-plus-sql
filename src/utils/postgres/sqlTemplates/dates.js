import { quoteIdent, quoteString, withoutSemicolon } from "./value";
import { columnDefinition } from "./clauses";

export const templates = [
  {
    id: "add_date_columns",
    category: "dates",
    label: "ALTER TABLE · ADD DATE COLUMNS",
    description:
      "Add date/timestamp columns in one go — emitted as one ALTER statement per column.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "new_table" },
      { key: "columns", label: "New columns", type: "columns" },
      {
        key: "ifNotExists",
        label: "IF NOT EXISTS",
        type: "switch",
        default: true,
      },
    ],
    build: (v) =>
      (v.columns ?? [])
        .filter((c) => c && c.name)
        .map(
          (c) =>
            `ALTER TABLE ${quoteIdent(v.table)} ADD COLUMN ${
              v.ifNotExists ? "IF NOT EXISTS " : ""
            }${columnDefinition(c)};`,
        )
        .join("\n"),
  },
  {
    id: "set_date_default",
    category: "dates",
    label: "ALTER COLUMN · SET DATE DEFAULT",
    description:
      "Give an existing column a default such as CURRENT_DATE or CURRENT_TIMESTAMP.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "new_table" },
      {
        key: "column",
        label: "Column",
        type: "text",
        default: "created_at",
      },
      {
        key: "defaultType",
        label: "Default to",
        type: "select",
        default: "CURRENT_DATE",
        options: [
          { value: "CURRENT_DATE", label: "CURRENT_DATE (today, date only)" },
          {
            value: "CURRENT_TIMESTAMP",
            label: "CURRENT_TIMESTAMP (local timestamp)",
          },
          { value: "now()", label: "now() (current, incl. tz)" },
        ],
      },
    ],
    build: (v) =>
      `ALTER TABLE ${quoteIdent(v.table)} ALTER COLUMN ${quoteIdent(
        v.column,
      )} SET DEFAULT ${v.defaultType};`,
  },
  {
    id: "query_by_date_range",
    category: "dates",
    label: "SELECT · BETWEEN dates",
    description: "Select rows whose date column falls in a range.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "new_table" },
      {
        key: "column",
        label: "Date column",
        type: "text",
        default: "start_date",
      },
      {
        key: "from",
        label: "From (YYYY-MM-DD)",
        type: "text",
        default: "2026-01-01",
      },
      {
        key: "to",
        label: "To (YYYY-MM-DD)",
        type: "text",
        default: "2026-12-31",
      },
    ],
    build: (v) => {
      const from = quoteString(v.from ?? "");
      const to = quoteString(v.to ?? "");
      return `SELECT * FROM ${quoteIdent(v.table)}\nWHERE ${quoteIdent(
        v.column,
      )} BETWEEN ${from}::date AND ${to}::date\nORDER BY ${quoteIdent(
        v.column,
      )};`;
    },
  },
  {
    id: "query_recent_rows",
    category: "dates",
    label: "SELECT · last N days",
    description: "Select rows from a date column within the last N days.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "new_table" },
      {
        key: "column",
        label: "Date column",
        type: "text",
        default: "created_at",
      },
      { key: "days", label: "Days back", type: "text", default: "30" },
    ],
    build: (v) => {
      const days = /^\d+$/.test(String(v.days ?? "").trim())
        ? String(v.days).trim()
        : "30";
      return `SELECT * FROM ${quoteIdent(v.table)}\nWHERE ${quoteIdent(
        v.column,
      )} >= CURRENT_DATE - ${days} * INTERVAL '1 day'\nORDER BY ${quoteIdent(
        v.column,
      )} DESC;`;
    },
  },
  {
    id: "select_by_period",
    category: "dates",
    label: "SELECT · group by period",
    description:
      "Bucket rows by year/month/day of a date column, e.g. 'YYYY-MM'.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "new_table" },
      {
        key: "column",
        label: "Date column",
        type: "text",
        default: "created_at",
      },
      {
        key: "period",
        label: "TO_CHAR pattern",
        type: "text",
        default: "'YYYY-MM'",
      },
    ],
    build: (v) => {
      const period = String(v.period ?? "").trim() || "'YYYY-MM'";
      return `SELECT TO_CHAR(${quoteIdent(
        v.column,
      )}, ${withoutSemicolon(period)}) AS period,\nCOUNT(*) AS rows_count\nFROM ${quoteIdent(
        v.table,
      )}\nGROUP BY period\nORDER BY period;`;
    },
  },
];
