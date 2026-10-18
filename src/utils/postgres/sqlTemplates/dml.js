import { quoteIdent, sqlValue, splitList } from "./value";
import { assignmentSql, whereClause } from "./clauses";

export const templates = [
  {
    id: "insert",
    category: "dml",
    label: "INSERT",
    description: "Add new rows to a table.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "new_table" },
      { key: "assignments", label: "Values", type: "assignments" },
      { key: "returning", label: "RETURNING *", type: "switch", default: true },
    ],
    build: (v) => {
      const cols = (v.assignments ?? []).filter((a) => a && a.column);
      if (!cols.length) return "";
      return `INSERT INTO ${quoteIdent(v.table)} (${cols
        .map((a) => quoteIdent(a.column))
        .join(", ")})\nVALUES (${cols
        .map((a) => sqlValue(a.value))
        .join(", ")})${v.returning ? "\nRETURNING *" : ""};`;
    },
  },
  {
    id: "insert_select",
    category: "dml",
    label: "INSERT · SELECT",
    description: "Copy rows from one table into another.",
    fields: [
      {
        key: "target",
        label: "Target table",
        type: "table",
        default: "customers_archive",
      },
      {
        key: "columns",
        label: "Target columns",
        type: "text",
        default: "id, name, created_at",
      },
      {
        key: "source",
        label: "Source table",
        type: "table",
        default: "customers",
      },
      { key: "conditions", label: "WHERE", type: "conditions" },
    ],
    build: (v) => {
      const lines = [
        `INSERT INTO ${quoteIdent(v.target)} (${v.columns})`,
        `SELECT ${v.columns}`,
        `FROM ${quoteIdent(v.source)}`,
      ];
      const where = whereClause(v.conditions);
      if (where) lines.push(where);
      return `${lines.join("\n")};`;
    },
  },
  {
    id: "upsert",
    category: "dml",
    label: "INSERT · ON CONFLICT",
    description: "Insert a row or update it when a unique constraint is hit.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "customers" },
      { key: "assignments", label: "Values (to insert)", type: "assignments" },
      {
        key: "conflict",
        label: "Conflict columns",
        type: "text",
        default: "email",
      },
      {
        key: "update",
        label: "Update on conflict",
        type: "text",
        default: "name = EXCLUDED.name",
      },
      { key: "returning", label: "RETURNING *", type: "switch", default: true },
    ],
    build: (v) => {
      const cols = (v.assignments ?? []).filter((a) => a && a.column);
      if (!cols.length) return "";
      const conflict = splitList(v.conflict).map(quoteIdent).join(", ");
      const update = String(v.update ?? "").trim();
      return `INSERT INTO ${quoteIdent(v.table)} (${cols
        .map((a) => quoteIdent(a.column))
        .join(", ")})\nVALUES (${cols
        .map((a) => sqlValue(a.value))
        .join(", ")})\nON CONFLICT (${conflict}) DO ${
        update ? `UPDATE SET ${update}` : "NOTHING"
      }${v.returning ? "\nRETURNING *" : ""};`;
    },
  },
  {
    id: "update",
    category: "dml",
    label: "UPDATE",
    description: "Modify existing rows that match a condition.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "new_table" },
      { key: "assignments", label: "SET", type: "assignments" },
      { key: "conditions", label: "WHERE", type: "conditions" },
      { key: "returning", label: "RETURNING *", type: "switch", default: true },
    ],
    build: (v) => {
      const set = assignmentSql(v.assignments);
      if (!set) return "";
      const lines = [`UPDATE ${quoteIdent(v.table)}`, `SET ${set}`];
      const where = whereClause(v.conditions);
      if (where) lines.push(where);
      if (v.returning) lines.push("RETURNING *");
      return `${lines.join("\n")};`;
    },
  },
  {
    id: "delete",
    category: "dml",
    label: "DELETE",
    description: "Remove rows that match a condition.",
    destructive: true,
    fields: [
      { key: "table", label: "Table", type: "table", default: "new_table" },
      { key: "conditions", label: "WHERE", type: "conditions" },
      { key: "returning", label: "RETURNING *", type: "switch", default: true },
    ],
    build: (v) => {
      const lines = [`DELETE FROM ${quoteIdent(v.table)}`];
      const where = whereClause(v.conditions);
      if (where) lines.push(where);
      if (v.returning) lines.push("RETURNING *");
      return `${lines.join("\n")};`;
    },
  },
];
