import { quoteIdent, quoteString, splitList, ensureSemicolon } from "./value";
import { buildColumns, columnDefinition } from "./clauses";

export const templates = [
  {
    id: "create_table",
    category: "ddl",
    label: "CREATE TABLE",
    description: "Define a new table and its columns, keys and defaults.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "new_table" },
      {
        key: "ifNotExists",
        label: "IF NOT EXISTS",
        type: "switch",
        default: true,
      },
      { key: "columns", label: "Columns", type: "columns" },
    ],
    build: (v) =>
      `CREATE TABLE${v.ifNotExists ? " IF NOT EXISTS" : ""} ${quoteIdent(
        v.table,
      )} (\n${buildColumns(v.columns)}\n);`,
  },
  {
    id: "add_column",
    category: "ddl",
    label: "ALTER TABLE · ADD COLUMN",
    description: "Add one or more columns to an existing table.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "new_table" },
      { key: "columns", label: "New columns", type: "columns" },
    ],
    build: (v) =>
      (v.columns ?? [])
        .filter((c) => c && c.name)
        .map(
          (c) =>
            `ALTER TABLE ${quoteIdent(v.table)} ADD COLUMN ${
              c.ifNotExists ? "IF NOT EXISTS " : ""
            }${columnDefinition(c)};`,
        )
        .join("\n"),
  },
  {
    id: "alter_column_type",
    category: "ddl",
    label: "ALTER TABLE · ALTER COLUMN TYPE",
    description:
      "Change a column data type, optionally with a USING expression.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "new_table" },
      { key: "column", label: "Column", type: "text", default: "column_name" },
      { key: "type", label: "New type", type: "type", default: "TEXT" },
      {
        key: "using",
        label: "USING expression",
        type: "text",
        placeholder: "column_name::text",
      },
    ],
    build: (v) =>
      `ALTER TABLE ${quoteIdent(v.table)} ALTER COLUMN ${quoteIdent(
        v.column,
      )} TYPE ${v.type}${v.using ? ` USING ${v.using}` : ""};`,
  },
  {
    id: "drop_column",
    category: "ddl",
    label: "ALTER TABLE · DROP COLUMN",
    description: "Remove a column from a table.",
    destructive: true,
    fields: [
      { key: "table", label: "Table", type: "table", default: "new_table" },
      { key: "column", label: "Column", type: "text", default: "column_name" },
      { key: "ifExists", label: "IF EXISTS", type: "switch", default: true },
      { key: "cascade", label: "CASCADE", type: "switch", default: false },
    ],
    build: (v) =>
      `ALTER TABLE ${quoteIdent(v.table)} DROP COLUMN${
        v.ifExists ? " IF EXISTS" : ""
      } ${quoteIdent(v.column)}${v.cascade ? " CASCADE" : ""};`,
  },
  {
    id: "rename_table",
    category: "ddl",
    label: "ALTER TABLE · RENAME",
    description: "Rename a table or a column.",
    fields: [
      {
        key: "target",
        label: "Rename",
        type: "select",
        default: "table",
        options: [
          { value: "table", label: "Table" },
          { value: "column", label: "Column" },
        ],
      },
      { key: "table", label: "Table", type: "table", default: "new_table" },
      { key: "oldName", label: "Old name", type: "text", default: "old_name" },
      { key: "newName", label: "New name", type: "text", default: "new_name" },
    ],
    build: (v) =>
      v.target === "column"
        ? `ALTER TABLE ${quoteIdent(v.table)} RENAME COLUMN ${quoteIdent(
            v.oldName,
          )} TO ${quoteIdent(v.newName)};`
        : `ALTER TABLE ${quoteIdent(v.oldName)} RENAME TO ${quoteIdent(
            v.newName,
          )};`,
  },
  {
    id: "create_index",
    category: "ddl",
    label: "CREATE INDEX",
    description: "Create an index to speed up lookups on one or more columns.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "new_table" },
      {
        key: "name",
        label: "Index name",
        type: "text",
        default: "idx_new_table_column",
      },
      { key: "unique", label: "UNIQUE", type: "switch", default: false },
      {
        key: "concurrently",
        label: "CONCURRENTLY",
        type: "switch",
        default: false,
      },
      {
        key: "ifNotExists",
        label: "IF NOT EXISTS",
        type: "switch",
        default: true,
      },
      {
        key: "columns",
        label: "Columns",
        type: "list",
        default: ["column_name"],
      },
      { key: "where", label: "WHERE (partial index)", type: "text" },
    ],
    build: (v) => {
      const cols = (v.columns ?? []).filter(Boolean).map(quoteIdent).join(", ");
      return `CREATE ${v.unique ? "UNIQUE " : ""}INDEX${
        v.concurrently ? " CONCURRENTLY" : ""
      }${v.ifNotExists ? " IF NOT EXISTS" : ""} ${quoteIdent(
        v.name,
      )} ON ${quoteIdent(v.table)} (${cols})${
        v.where ? ` WHERE ${v.where}` : ""
      };`;
    },
  },
  {
    id: "create_view",
    category: "ddl",
    label: "CREATE VIEW",
    description: "Save a query as a reusable virtual table.",
    fields: [
      { key: "name", label: "View name", type: "text", default: "my_view" },
      { key: "replace", label: "OR REPLACE", type: "switch", default: true },
      {
        key: "query",
        label: "Query",
        type: "textarea",
        default: "SELECT *\nFROM new_table",
      },
    ],
    build: (v) =>
      `CREATE ${v.replace ? "OR REPLACE " : ""}VIEW ${quoteIdent(
        v.name,
      )} AS\n${ensureSemicolon(v.query)}`,
  },
  {
    id: "create_schema",
    category: "ddl",
    label: "CREATE SCHEMA",
    description: "Create a new schema (namespace) in the database.",
    fields: [
      { key: "name", label: "Schema", type: "text", default: "app" },
      {
        key: "ifNotExists",
        label: "IF NOT EXISTS",
        type: "switch",
        default: true,
      },
      { key: "authorization", label: "AUTHORIZATION role", type: "text" },
    ],
    build: (v) =>
      `CREATE SCHEMA${v.ifNotExists ? " IF NOT EXISTS" : ""} ${quoteIdent(
        v.name,
      )}${
        v.authorization ? ` AUTHORIZATION ${quoteIdent(v.authorization)}` : ""
      };`,
  },
  {
    id: "create_enum",
    category: "ddl",
    label: "CREATE TYPE · ENUM",
    description: "Define a set of allowed values as an enum type.",
    fields: [
      { key: "name", label: "Type name", type: "text", default: "status" },
      {
        key: "values",
        label: "Values (comma separated)",
        type: "text",
        default: "active, inactive, archived",
      },
    ],
    build: (v) => {
      const values = splitList(v.values).map(quoteString).join(", ");
      return `CREATE TYPE ${quoteIdent(v.name)} AS ENUM (${values});`;
    },
  },
  {
    id: "truncate",
    category: "ddl",
    label: "TRUNCATE TABLE",
    description: "Delete every row quickly, optionally restarting identities.",
    destructive: true,
    fields: [
      { key: "table", label: "Table", type: "table", default: "new_table" },
      {
        key: "restartIdentity",
        label: "RESTART IDENTITY",
        type: "switch",
        default: true,
      },
      { key: "cascade", label: "CASCADE", type: "switch", default: false },
    ],
    build: (v) =>
      `TRUNCATE TABLE ${quoteIdent(v.table)}${
        v.restartIdentity ? " RESTART IDENTITY" : ""
      }${v.cascade ? " CASCADE" : ""};`,
  },
  {
    id: "drop_table",
    category: "ddl",
    label: "DROP TABLE",
    description: "Destroy a table and all of its data.",
    destructive: true,
    fields: [
      { key: "table", label: "Table", type: "table", default: "new_table" },
      { key: "ifExists", label: "IF EXISTS", type: "switch", default: true },
      { key: "cascade", label: "CASCADE", type: "switch", default: false },
    ],
    build: (v) =>
      `DROP TABLE${v.ifExists ? " IF EXISTS" : ""} ${quoteIdent(v.table)}${
        v.cascade ? " CASCADE" : ""
      };`,
  },
  {
    id: "comment_on",
    category: "ddl",
    label: "COMMENT ON",
    description: "Document a table, column, schema or index in the catalog.",
    fields: [
      {
        key: "target",
        label: "Object",
        type: "select",
        default: "TABLE",
        options: [
          { value: "TABLE", label: "Table" },
          { value: "COLUMN", label: "Column" },
          { value: "SCHEMA", label: "Schema" },
          { value: "INDEX", label: "Index" },
        ],
      },
      { key: "table", label: "Table", type: "table", default: "new_table" },
      {
        key: "column",
        label: "Column",
        type: "text",
        default: "column_name",
        when: (v) => v.target === "COLUMN",
      },
      {
        key: "comment",
        label: "Comment",
        type: "text",
        default: "Describes the object",
      },
    ],
    build: (v) => {
      const target =
        v.target === "COLUMN"
          ? `${quoteIdent(v.table)}.${quoteIdent(v.column)}`
          : quoteIdent(v.table);
      return `COMMENT ON ${v.target} ${target} IS ${quoteString(v.comment)};`;
    },
  },
];
