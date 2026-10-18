import {
  quoteIdent,
  ensureSemicolon,
  indentSql,
  doBlock,
  withoutSemicolon,
} from "./value";

export const templates = [
  {
    id: "do_if_else",
    category: "logic",
    label: "DO block · IF / ELSE",
    description: "Run procedural logic with conditional branches (PL/pgSQL).",
    fields: [
      {
        key: "condition",
        label: "Condition",
        type: "textarea",
        default: "EXISTS (SELECT 1 FROM customers WHERE status = 'new')",
      },
      {
        key: "thenSql",
        label: "THEN",
        type: "textarea",
        default: "RAISE NOTICE 'found new customers';",
      },
      {
        key: "elseSql",
        label: "ELSE",
        type: "textarea",
        default: "RAISE NOTICE 'nothing to do';",
      },
    ],
    build: (v) =>
      doBlock([
        `IF ${withoutSemicolon(v.condition)} THEN`,
        indentSql(ensureSemicolon(v.thenSql), "  "),
        "ELSE",
        indentSql(ensureSemicolon(v.elseSql), "  "),
        "END IF;",
      ]),
  },
  {
    id: "create_function",
    category: "logic",
    label: "CREATE FUNCTION",
    description: "Create a reusable PL/pgSQL function.",
    fields: [
      {
        key: "name",
        label: "Function name",
        type: "text",
        default: "do_something",
      },
      {
        key: "params",
        label: "Parameters",
        type: "text",
        default: "input_id INTEGER",
      },
      { key: "returns", label: "Returns", type: "text", default: "BOOLEAN" },
      {
        key: "volatility",
        label: "Volatility",
        type: "select",
        default: "VOLATILE",
        options: [
          { value: "VOLATILE", label: "VOLATILE" },
          { value: "STABLE", label: "STABLE" },
          { value: "IMMUTABLE", label: "IMMUTABLE" },
        ],
      },
      {
        key: "body",
        label: "Body",
        type: "textarea",
        default:
          "UPDATE customers SET status = 'active' WHERE id = input_id;\nRETURN FOUND;",
      },
    ],
    build: (v) =>
      `CREATE OR REPLACE FUNCTION ${quoteIdent(v.name)}(${
        v.params
      })\nRETURNS ${v.returns}\nLANGUAGE plpgsql\n${
        v.volatility
      }\nAS $$\nBEGIN\n${indentSql(ensureSemicolon(v.body))}\nEND;\n$$;`,
  },
];
