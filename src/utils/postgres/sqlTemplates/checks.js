import { quoteIdent } from "./value";

export const templates = [
  {
    id: "add_check",
    category: "checks",
    label: "ALTER TABLE · ADD CHECK",
    description: "Add a named CHECK constraint with a custom expression.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "new_table" },
      {
        key: "name",
        label: "Constraint name",
        type: "text",
        default: "",
        placeholder: "table_check (auto)",
      },
      {
        key: "expression",
        label: "Check expression",
        type: "text",
        default: "price >= 0",
      },
      {
        key: "notValid",
        label: "NOT VALID",
        type: "switch",
        default: false,
      },
    ],
    build: (v) => {
      const name = String(v.name ?? "").trim()
        ? v.name
        : `${v.table ?? "table"}_check`;
      return `ALTER TABLE ${quoteIdent(v.table)} ADD CONSTRAINT ${quoteIdent(
        name,
      )} CHECK (${v.expression})${v.notValid ? " NOT VALID" : ""};`;
    },
  },
  {
    id: "add_check_between",
    category: "checks",
    label: "ADD CHECK · column compare",
    description:
      "Check that one column relates to another, e.g. end_date after start_date.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "new_table" },
      {
        key: "startColumn",
        label: "Start / first column",
        type: "text",
        default: "start_date",
      },
      {
        key: "endColumn",
        label: "End / second column",
        type: "text",
        default: "end_date",
      },
      {
        key: "operator",
        label: "Relation",
        type: "select",
        default: ">=",
        options: [
          { value: ">=", label: ">= (at or after)" },
          { value: ">", label: "> (strictly after)" },
          { value: "<=", label: "<= (at or before)" },
          { value: "<", label: "< (strictly before)" },
        ],
      },
      {
        key: "name",
        label: "Constraint name",
        type: "text",
        default: "",
        placeholder: "table_check (auto)",
      },
    ],
    build: (v) => {
      const name = String(v.name ?? "").trim()
        ? v.name
        : `${v.table ?? "table"}_check`;
      return `ALTER TABLE ${quoteIdent(v.table)} ADD CONSTRAINT ${quoteIdent(
        name,
      )} CHECK (${quoteIdent(v.startColumn)} ${v.operator ?? ">="} ${quoteIdent(
        v.endColumn,
      )});`;
    },
  },
  {
    id: "drop_check",
    category: "checks",
    label: "ALTER TABLE · DROP CONSTRAINT",
    description: "Remove a CHECK or other named constraint from a table.",
    destructive: true,
    fields: [
      { key: "table", label: "Table", type: "table", default: "new_table" },
      {
        key: "name",
        label: "Constraint name",
        type: "text",
        default: "my_check",
      },
      { key: "ifExists", label: "IF EXISTS", type: "switch", default: true },
    ],
    build: (v) =>
      `ALTER TABLE ${quoteIdent(v.table)} DROP CONSTRAINT${
        v.ifExists ? " IF EXISTS" : ""
      } ${quoteIdent(v.name)};`,
  },
];
