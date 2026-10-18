import { useMemo, useState } from "react";
import { Button } from "@douyinfe/semi-ui";
import { IconPlay, IconPlus, IconRefresh } from "@douyinfe/semi-icons";
import { useTranslation } from "react-i18next";
import {
  buildTemplateSql,
  defaultValues,
} from "../../../../utils/postgres/sqlTemplates";
import FieldEditor from "./FieldEditor";
import { Label } from "./repeaters";

const FULL_WIDTH_TYPES = new Set([
  "columns",
  "assignments",
  "conditions",
  "order",
  "list",
  "textarea",
]);

function visibleFields(template, values) {
  return (template.fields ?? []).filter(
    (field) => !field.when || field.when(values),
  );
}

export default function TemplateForm({
  template,
  onInsert,
  onRun,
  disabled,
  tables,
}) {
  const { t } = useTranslation();
  const [values, setValues] = useState(() => defaultValues(template));
  const sql = useMemo(
    () => buildTemplateSql(template, values),
    [template, values],
  );

  const set = (key, value) => setValues((prev) => ({ ...prev, [key]: value }));

  // Column suggestions come from the first table field that matches the catalog.
  const tableField = visibleFields(template, values).find(
    (field) => field.type === "table" && values[field.key],
  );
  const columnData = useMemo(() => {
    if (!tableField || !tables?.length) return [];
    return (
      tables.find((table) => table.name === values[tableField.key])?.columns ??
      []
    );
  }, [tableField, tables, values]);

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[11px] opacity-70 leading-snug">
        {template.description}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {visibleFields(template, values).map((field) => (
          <div
            key={field.key}
            className={FULL_WIDTH_TYPES.has(field.type) ? "col-span-2" : ""}
          >
            <Label>{field.label}</Label>
            <FieldEditor
              field={field}
              value={values[field.key]}
              onChange={(v) => set(field.key, v)}
              t={t}
              tables={tables}
              columnData={columnData}
            />
          </div>
        ))}
      </div>

      <div>
        <Label>{t("sql_template_preview")}</Label>
        <pre className="text-[11px] font-mono whitespace-pre-wrap break-words rounded border border-color bg-zinc-50 dark:bg-neutral-900 p-2 max-h-44 overflow-auto m-0">
          {sql || "--"}
        </pre>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="small"
          theme="solid"
          icon={<IconPlay />}
          disabled={disabled || !sql}
          onClick={() => onRun(sql)}
        >
          {t("run")}
        </Button>
        <Button
          size="small"
          icon={<IconPlus />}
          disabled={!sql}
          onClick={() => onInsert(sql)}
        >
          {t("sql_template_insert")}
        </Button>
        <Button
          size="small"
          theme="borderless"
          icon={<IconRefresh />}
          onClick={() => setValues(defaultValues(template))}
        >
          {t("sql_template_reset")}
        </Button>
      </div>
    </div>
  );
}
