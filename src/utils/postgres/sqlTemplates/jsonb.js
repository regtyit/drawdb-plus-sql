import { quoteIdent, quoteString } from "./value";
import {
  jsonbAccess,
  jsonbPathLiteral,
  orderClause,
  whereClause,
} from "./clauses";

export const templates = [
  {
    id: "jsonb_query",
    category: "jsonb",
    label: "JSONB · extract value",
    description: "Read a field out of a jsonb column using -> and ->>.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "events" },
      {
        key: "column",
        label: "JSONB column",
        type: "text",
        default: "payload",
      },
      { key: "columns", label: "Other columns", type: "text", default: "id" },
      {
        key: "path",
        label: "Path (dot separated)",
        type: "text",
        default: "user",
      },
      {
        key: "textValue",
        label: "Return as text (->>)",
        type: "switch",
        default: true,
      },
      { key: "conditions", label: "WHERE", type: "conditions" },
    ],
    build: (v) => {
      const access = jsonbAccess(v.column, v.path, v.textValue);
      const lines = [
        `SELECT ${[v.columns, `${access} AS value`].filter(Boolean).join(", ")}`,
        `FROM ${quoteIdent(v.table)}`,
      ];
      const where = whereClause(v.conditions);
      if (where) lines.push(where);
      return `${lines.join("\n")};`;
    },
  },
  {
    id: "jsonb_contains",
    category: "jsonb",
    label: "JSONB · containment (@>)",
    description: "Find rows whose jsonb value contains a given document.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "events" },
      {
        key: "column",
        label: "JSONB column",
        type: "text",
        default: "payload",
      },
      {
        key: "filter",
        label: "Document",
        type: "textarea",
        default: '{"status": "active"}',
      },
      { key: "order", label: "ORDER BY", type: "order" },
      { key: "limit", label: "LIMIT", type: "number", default: 50 },
    ],
    build: (v) => {
      const lines = [
        "SELECT *",
        `FROM ${quoteIdent(v.table)}`,
        `WHERE ${quoteIdent(v.column)} @> ${quoteString(v.filter)}::jsonb`,
      ];
      const order = orderClause(v.order);
      if (order) lines.push(order);
      if (v.limit) lines.push(`LIMIT ${v.limit}`);
      return `${lines.join("\n")};`;
    },
  },
  {
    id: "jsonb_insert",
    category: "jsonb",
    label: "JSONB · insert document",
    description: "Insert a row with a jsonb document value.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "events" },
      {
        key: "column",
        label: "JSONB column",
        type: "text",
        default: "payload",
      },
      {
        key: "document",
        label: "Document",
        type: "textarea",
        default: '{"type": "signup", "user": {"id": 1}}',
      },
      { key: "returning", label: "RETURNING *", type: "switch", default: true },
    ],
    build: (v) =>
      `INSERT INTO ${quoteIdent(v.table)} (${quoteIdent(
        v.column,
      )})\nVALUES (${quoteString(v.document)}::jsonb)${
        v.returning ? "\nRETURNING *" : ""
      };`,
  },
  {
    id: "jsonb_set",
    category: "jsonb",
    label: "JSONB · update key (jsonb_set)",
    description:
      "Set or replace a nested key without rewriting the whole document.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "events" },
      {
        key: "column",
        label: "JSONB column",
        type: "text",
        default: "payload",
      },
      {
        key: "path",
        label: "Path (dot separated)",
        type: "text",
        default: "user.status",
      },
      {
        key: "value",
        label: "New value (jsonb)",
        type: "text",
        default: '"active"',
      },
      { key: "conditions", label: "WHERE", type: "conditions" },
      { key: "returning", label: "RETURNING *", type: "switch", default: true },
    ],
    build: (v) => {
      const lines = [
        `UPDATE ${quoteIdent(v.table)}`,
        `SET ${quoteIdent(v.column)} = jsonb_set(${quoteIdent(
          v.column,
        )}, ${jsonbPathLiteral(v.path)}, ${quoteString(v.value)}::jsonb, true)`,
      ];
      const where = whereClause(v.conditions);
      if (where) lines.push(where);
      if (v.returning) lines.push("RETURNING *");
      return `${lines.join("\n")};`;
    },
  },
  {
    id: "jsonb_expand",
    category: "jsonb",
    label: "JSONB · expand array/object",
    description:
      "Turn a jsonb array or object into rows with jsonb_array_elements / jsonb_each.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "events" },
      {
        key: "column",
        label: "JSONB column",
        type: "text",
        default: "payload",
      },
      {
        key: "mode",
        label: "Mode",
        type: "select",
        default: "array",
        options: [
          { value: "array", label: "Array elements" },
          { value: "each", label: "Object keys/values" },
        ],
      },
      {
        key: "path",
        label: "Path before expansion",
        type: "text",
        default: "items",
      },
      { key: "conditions", label: "WHERE", type: "conditions" },
    ],
    build: (v) => {
      const access = v.path
        ? `${quoteIdent(v.column)}->${quoteString(v.path)}`
        : quoteIdent(v.column);
      const fn = v.mode === "each" ? "jsonb_each" : "jsonb_array_elements";
      const lines = [
        `SELECT ${quoteIdent(v.table)}.*, item`,
        `FROM ${quoteIdent(v.table)},`,
        `  ${fn}(${access}) AS item`,
      ];
      const where = whereClause(v.conditions);
      if (where) lines.push(where);
      return `${lines.join("\n")};`;
    },
  },
];
