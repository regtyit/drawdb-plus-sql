import { templates as ddl } from "./ddl";
import { templates as dql } from "./dql";
import { templates as dml } from "./dml";
import { templates as dcl } from "./dcl";
import { templates as tcl } from "./tcl";
import { templates as jsonb } from "./jsonb";
import { templates as logic } from "./logic";

export const sqlCategories = [
  { id: "ddl", labelKey: "sql_cat_ddl" },
  { id: "dql", labelKey: "sql_cat_dql" },
  { id: "dml", labelKey: "sql_cat_dml" },
  { id: "dcl", labelKey: "sql_cat_dcl" },
  { id: "tcl", labelKey: "sql_cat_tcl" },
  { id: "jsonb", labelKey: "sql_cat_jsonb" },
  { id: "logic", labelKey: "sql_cat_logic" },
];

export const sqlTemplates = [
  ...ddl,
  ...dql,
  ...dml,
  ...dcl,
  ...tcl,
  ...jsonb,
  ...logic,
];

export function getTemplatesByCategory(category) {
  return sqlTemplates.filter((template) => template.category === category);
}

export function getTemplate(id) {
  return sqlTemplates.find((template) => template.id === id) ?? null;
}

export function defaultValues(template) {
  const values = {};
  for (const field of template?.fields ?? []) {
    if (field.type === "columns") {
      values[field.key] = [
        {
          name: "id",
          type: "SERIAL",
          primary: true,
          notNull: true,
          unique: false,
          default: "",
        },
        {
          name: "name",
          type: "TEXT",
          notNull: true,
          unique: false,
          default: "",
        },
      ];
    } else if (field.type === "assignments") {
      values[field.key] = [{ column: "name", value: "test" }];
    } else if (field.type === "conditions") {
      values[field.key] = [];
    } else if (field.type === "order") {
      values[field.key] = [];
    } else if (field.type === "list") {
      values[field.key] = [...(field.default ?? [])];
    } else {
      values[field.key] = field.default ?? "";
    }
  }
  return values;
}

export function buildTemplateSql(template, values) {
  if (!template) return "";
  try {
    return template.build(values) ?? "";
  } catch {
    return "";
  }
}
