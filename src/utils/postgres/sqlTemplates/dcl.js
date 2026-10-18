import { quoteIdent } from "./value";

const OBJECT_TYPES = [
  { value: "TABLE", label: "Table" },
  { value: "SCHEMA", label: "Schema" },
  { value: "DATABASE", label: "Database" },
  { value: "SEQUENCE", label: "Sequence" },
  { value: "FUNCTION", label: "Function" },
];

export const templates = [
  {
    id: "grant",
    category: "dcl",
    label: "GRANT",
    description: "Give a role privileges on a database object.",
    fields: [
      {
        key: "privileges",
        label: "Privileges",
        type: "text",
        default: "SELECT, INSERT, UPDATE",
      },
      {
        key: "objectType",
        label: "Object type",
        type: "select",
        default: "TABLE",
        options: OBJECT_TYPES,
      },
      {
        key: "object",
        label: "Object name",
        type: "text",
        default: "new_table",
      },
      { key: "role", label: "Role", type: "text", default: "app_user" },
      {
        key: "withGrant",
        label: "WITH GRANT OPTION",
        type: "switch",
        default: false,
      },
    ],
    build: (v) =>
      `GRANT ${v.privileges} ON ${v.objectType} ${quoteIdent(
        v.object,
      )} TO ${quoteIdent(v.role)}${v.withGrant ? " WITH GRANT OPTION" : ""};`,
  },
  {
    id: "revoke",
    category: "dcl",
    label: "REVOKE",
    description: "Remove privileges previously granted to a role.",
    fields: [
      {
        key: "privileges",
        label: "Privileges",
        type: "text",
        default: "DELETE",
      },
      {
        key: "objectType",
        label: "Object type",
        type: "select",
        default: "TABLE",
        options: OBJECT_TYPES,
      },
      {
        key: "object",
        label: "Object name",
        type: "text",
        default: "new_table",
      },
      { key: "role", label: "Role", type: "text", default: "app_user" },
      { key: "cascade", label: "CASCADE", type: "switch", default: false },
    ],
    build: (v) =>
      `REVOKE ${v.privileges} ON ${v.objectType} ${quoteIdent(
        v.object,
      )} FROM ${quoteIdent(v.role)}${v.cascade ? " CASCADE" : ""};`,
  },
];
