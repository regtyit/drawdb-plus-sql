import {
  quoteIdent,
  ensureSemicolon,
  withoutSemicolon,
  indentSql,
} from "./value";
import { conditionSql, orderClause, whereClause } from "./clauses";

export const templates = [
  {
    id: "select_basic",
    category: "dql",
    label: "SELECT",
    description: "Query rows with filters, ordering and pagination.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "new_table" },
      { key: "columns", label: "Columns", type: "text", default: "*" },
      { key: "distinct", label: "DISTINCT", type: "switch", default: false },
      { key: "conditions", label: "WHERE", type: "conditions" },
      { key: "order", label: "ORDER BY", type: "order" },
      { key: "limit", label: "LIMIT", type: "number", default: 50 },
      { key: "offset", label: "OFFSET", type: "number" },
    ],
    build: (v) => {
      const lines = [
        `SELECT ${v.distinct ? "DISTINCT " : ""}${v.columns || "*"}`,
        `FROM ${quoteIdent(v.table)}`,
      ];
      const where = whereClause(v.conditions);
      if (where) lines.push(where);
      const order = orderClause(v.order);
      if (order) lines.push(order);
      if (v.limit) lines.push(`LIMIT ${v.limit}`);
      if (v.offset) lines.push(`OFFSET ${v.offset}`);
      return `${lines.join("\n")};`;
    },
  },
  {
    id: "select_join",
    category: "dql",
    label: "SELECT · JOIN",
    description: "Combine rows from two tables on a matching key.",
    fields: [
      {
        key: "joinType",
        label: "Join",
        type: "select",
        default: "INNER",
        options: [
          { value: "INNER", label: "INNER" },
          { value: "LEFT", label: "LEFT" },
          { value: "RIGHT", label: "RIGHT" },
          { value: "FULL", label: "FULL" },
        ],
      },
      {
        key: "leftTable",
        label: "Left table",
        type: "table",
        default: "customers",
      },
      {
        key: "rightTable",
        label: "Right table",
        type: "table",
        default: "orders",
      },
      {
        key: "leftKey",
        label: "Left key",
        type: "text",
        default: "customer_id",
      },
      {
        key: "rightKey",
        label: "Right key",
        type: "text",
        default: "customer_id",
      },
      { key: "columns", label: "Columns", type: "text", default: "*" },
      { key: "conditions", label: "WHERE", type: "conditions" },
      { key: "order", label: "ORDER BY", type: "order" },
      { key: "limit", label: "LIMIT", type: "number", default: 50 },
    ],
    build: (v) => {
      const joinKeyword =
        v.joinType === "INNER" ? "INNER JOIN" : `${v.joinType} JOIN`;
      const lines = [
        `SELECT ${v.columns || "*"}`,
        `FROM ${quoteIdent(v.leftTable)}`,
        `${joinKeyword} ${quoteIdent(v.rightTable)}`,
        `  ON ${quoteIdent(v.leftTable)}.${quoteIdent(v.leftKey)} = ${quoteIdent(
          v.rightTable,
        )}.${quoteIdent(v.rightKey)}`,
      ];
      const where = whereClause(v.conditions);
      if (where) lines.push(where);
      const order = orderClause(v.order);
      if (order) lines.push(order);
      if (v.limit) lines.push(`LIMIT ${v.limit}`);
      return `${lines.join("\n")};`;
    },
  },
  {
    id: "select_aggregate",
    category: "dql",
    label: "SELECT · GROUP BY",
    description:
      "Aggregate rows into summary values and filter groups with HAVING.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "orders" },
      {
        key: "groupBy",
        label: "GROUP BY",
        type: "text",
        default: "customer_id",
      },
      {
        key: "aggregates",
        label: "Aggregates",
        type: "text",
        default: "COUNT(*) AS total, SUM(amount) AS sum_amount",
      },
      { key: "having", label: "HAVING", type: "conditions" },
      { key: "order", label: "ORDER BY", type: "order" },
      { key: "limit", label: "LIMIT", type: "number", default: 50 },
    ],
    build: (v) => {
      const select = [v.groupBy, v.aggregates].filter(Boolean).join(", ");
      const lines = [`SELECT ${select}`, `FROM ${quoteIdent(v.table)}`];
      if (v.groupBy) lines.push(`GROUP BY ${v.groupBy}`);
      const having = v.having?.map(conditionSql).filter(Boolean).join(" AND ");
      if (having) lines.push(`HAVING ${having}`);
      const order = orderClause(v.order);
      if (order) lines.push(order);
      if (v.limit) lines.push(`LIMIT ${v.limit}`);
      return `${lines.join("\n")};`;
    },
  },
  {
    id: "select_exists",
    category: "dql",
    label: "SELECT · EXISTS",
    description: "Filter rows using the existence of a correlated subquery.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "customers" },
      { key: "columns", label: "Columns", type: "text", default: "name" },
      {
        key: "subTable",
        label: "Subquery table",
        type: "table",
        default: "orders",
      },
      {
        key: "correlation",
        label: "Correlation",
        type: "text",
        default: "orders.customer_id = customers.customer_id",
      },
      { key: "subConditions", label: "Subquery WHERE", type: "conditions" },
    ],
    build: (v) => {
      const sub = ["SELECT 1", `FROM ${quoteIdent(v.subTable)}`];
      const filters = [
        whereClause(v.subConditions).replace(/^WHERE /, ""),
        v.correlation,
      ]
        .filter(Boolean)
        .join(" AND ");
      if (filters) sub.push(`WHERE ${filters}`);
      return `SELECT ${v.columns || "*"}\nFROM ${quoteIdent(
        v.table,
      )}\nWHERE EXISTS (\n  ${sub.join("\n  ")}\n);`;
    },
  },
  {
    id: "select_union",
    category: "dql",
    label: "SELECT · UNION",
    description: "Combine the results of two queries.",
    fields: [
      {
        key: "all",
        label: "UNION ALL (keep duplicates)",
        type: "switch",
        default: false,
      },
      {
        key: "queryA",
        label: "Query A",
        type: "textarea",
        default: "SELECT name FROM customers",
      },
      {
        key: "queryB",
        label: "Query B",
        type: "textarea",
        default: "SELECT name FROM suppliers",
      },
      { key: "order", label: "ORDER BY", type: "order" },
      { key: "limit", label: "LIMIT", type: "number" },
    ],
    build: (v) => {
      const lines = [
        withoutSemicolon(ensureSemicolon(v.queryA)),
        `UNION${v.all ? " ALL" : ""}`,
        withoutSemicolon(ensureSemicolon(v.queryB)),
      ];
      const order = orderClause(v.order);
      if (order) lines.push(order);
      if (v.limit) lines.push(`LIMIT ${v.limit}`);
      return `${lines.join("\n")};`;
    },
  },
  {
    id: "select_cte",
    category: "dql",
    label: "WITH · CTE",
    description: "Name a subquery with WITH and reuse it in the main query.",
    fields: [
      { key: "name", label: "CTE name", type: "text", default: "recent" },
      {
        key: "cteBody",
        label: "CTE query",
        type: "textarea",
        default:
          "SELECT *\nFROM orders\nWHERE created_at > NOW() - INTERVAL '30 days'",
      },
      {
        key: "query",
        label: "Main query",
        type: "textarea",
        default: "SELECT *\nFROM recent\nLIMIT 50",
      },
    ],
    build: (v) =>
      `WITH ${quoteIdent(v.name)} AS (\n${indentSql(
        withoutSemicolon(ensureSemicolon(v.cteBody)),
      )}\n)\n${ensureSemicolon(v.query)}`,
  },
  {
    id: "select_distinct",
    category: "dql",
    label: "SELECT · DISTINCT",
    description: "Return only unique combinations of the selected columns.",
    fields: [
      { key: "table", label: "Table", type: "table", default: "customers" },
      { key: "columns", label: "Columns", type: "text", default: "name" },
      { key: "order", label: "ORDER BY", type: "order" },
      { key: "limit", label: "LIMIT", type: "number", default: 50 },
    ],
    build: (v) => {
      const lines = [
        `SELECT DISTINCT ${v.columns || "*"}`,
        `FROM ${quoteIdent(v.table)}`,
      ];
      const order = orderClause(v.order);
      if (order) lines.push(order);
      if (v.limit) lines.push(`LIMIT ${v.limit}`);
      return `${lines.join("\n")};`;
    },
  },
];
