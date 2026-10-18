import {
  quoteIdent,
  ensureSemicolon,
  indentSql,
  withoutSemicolon,
  doBlock,
} from "./value";

export const templates = [
  {
    id: "transaction",
    category: "tcl",
    label: "BEGIN · COMMIT",
    description: "Run several statements atomically in one transaction.",
    fields: [
      {
        key: "isolation",
        label: "Isolation level",
        type: "select",
        default: "",
        options: [
          { value: "", label: "(default)" },
          { value: "READ COMMITTED", label: "READ COMMITTED" },
          { value: "REPEATABLE READ", label: "REPEATABLE READ" },
          { value: "SERIALIZABLE", label: "SERIALIZABLE" },
        ],
      },
      { key: "readOnly", label: "READ ONLY", type: "switch", default: false },
      {
        key: "deferrable",
        label: "DEFERRABLE",
        type: "switch",
        default: false,
      },
      {
        key: "body",
        label: "Statements",
        type: "textarea",
        default:
          "UPDATE accounts SET balance = balance - 100 WHERE id = 1;\nUPDATE accounts SET balance = balance + 100 WHERE id = 2;",
      },
    ],
    build: (v) => {
      const options = [
        v.isolation,
        v.readOnly ? "READ ONLY" : "",
        v.deferrable ? "DEFERRABLE" : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `BEGIN${options ? ` ${options}` : ""};\n${String(
        v.body ?? "",
      ).trim()}\nCOMMIT;`;
    },
  },
  {
    id: "savepoint",
    category: "tcl",
    label: "SAVEPOINT",
    description:
      "Mark a point inside a transaction and optionally roll back to it.",
    fields: [
      {
        key: "name",
        label: "Savepoint name",
        type: "text",
        default: "before_update",
      },
      {
        key: "body",
        label: "Statements before savepoint",
        type: "textarea",
        default: "UPDATE accounts SET balance = balance - 100 WHERE id = 1;",
      },
      {
        key: "rollback",
        label: "ROLLBACK TO savepoint",
        type: "switch",
        default: true,
      },
    ],
    build: (v) =>
      `BEGIN;\n${String(v.body ?? "").trim()}\nSAVEPOINT ${quoteIdent(
        v.name,
      )};\n-- additional statements here\n${
        v.rollback ? `ROLLBACK TO SAVEPOINT ${quoteIdent(v.name)};\n` : ""
      }COMMIT;`,
  },
  {
    id: "conditional_txn",
    category: "tcl",
    label: "Conditional transaction (IF EXISTS)",
    description:
      "Run one of two blocks depending on a condition, wrapped in a transaction.",
    fields: [
      {
        key: "condition",
        label: "IF condition",
        type: "textarea",
        default: "SELECT 1 FROM customers WHERE id = 1",
      },
      {
        key: "thenSql",
        label: "THEN (if true)",
        type: "textarea",
        default: "UPDATE customers SET status = 'active' WHERE id = 1;",
      },
      {
        key: "elseSql",
        label: "ELSE (if false)",
        type: "textarea",
        default:
          "INSERT INTO customers (name, status) VALUES ('New customer', 'active');",
      },
    ],
    build: (v) =>
      [
        "BEGIN;",
        doBlock([
          `IF EXISTS (${withoutSemicolon(v.condition)}) THEN`,
          indentSql(ensureSemicolon(v.thenSql), "  "),
          "ELSE",
          indentSql(ensureSemicolon(v.elseSql), "  "),
          "END IF;",
        ]),
        "COMMIT;",
      ].join("\n"),
  },
  {
    id: "lock",
    category: "tcl",
    label: "LOCK TABLE",
    description: "Take an explicit lock inside a transaction.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "new_table" },
      {
        key: "mode",
        label: "Mode",
        type: "select",
        default: "SHARE ROW EXCLUSIVE",
        options: [
          "ACCESS SHARE",
          "ROW SHARE",
          "ROW EXCLUSIVE",
          "SHARE UPDATE EXCLUSIVE",
          "SHARE",
          "SHARE ROW EXCLUSIVE",
          "EXCLUSIVE",
          "ACCESS EXCLUSIVE",
        ].map((mode) => ({ value: mode, label: mode })),
      },
      { key: "nowait", label: "NOWAIT", type: "switch", default: false },
    ],
    build: (v) =>
      `BEGIN;\nLOCK TABLE ${quoteIdent(v.table)} IN ${v.mode} MODE${
        v.nowait ? " NOWAIT" : ""
      };\n-- statements\nCOMMIT;`,
  },
];
