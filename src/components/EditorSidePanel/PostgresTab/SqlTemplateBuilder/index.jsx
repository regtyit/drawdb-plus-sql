import { useEffect, useMemo, useState } from "react";
import { Button, Modal, Select } from "@douyinfe/semi-ui";
import { IconEdit } from "@douyinfe/semi-icons";
import { useTranslation } from "react-i18next";
import {
  buildTemplateSql,
  defaultValues,
  getTemplate,
  getTemplatesByCategory,
  sqlCategories,
  sqlTemplates,
} from "../../../../utils/postgres/sqlTemplates";
import TemplateForm from "./TemplateForm";
import { fetchDbTableCatalog } from "./dbCatalog";

export default function SqlTemplateBuilder({
  onInsert,
  onRun,
  disabled = false,
  connection,
  connected,
}) {
  const { t } = useTranslation();
  const [category, setCategory] = useState("ddl");
  const [templateId, setTemplateId] = useState("create_table");
  const [formOpen, setFormOpen] = useState(false);
  const [tables, setTables] = useState([]);

  useEffect(() => {
    if (!connected) return;
    let active = true;
    fetchDbTableCatalog(connection).then((res) => {
      if (active) setTables(res);
    });
    return () => {
      active = false;
    };
  }, [connected, connection]);

  const templates = useMemo(() => getTemplatesByCategory(category), [category]);
  const template = getTemplate(templateId) ?? templates[0];

  const pickCategory = (next) => {
    setCategory(next);
    const first = getTemplatesByCategory(next)[0];
    if (first) setTemplateId(first.id);
  };

  /** One click: generate the default SQL for the template into the editor. */
  const pickChip = (tpl) => {
    setCategory(tpl.category);
    setTemplateId(tpl.id);
    onInsert(buildTemplateSql(tpl, defaultValues(tpl)));
  };

  return (
    <div className="pg-highlight p-2 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="pg-tab">
          <span className="text-xs font-semibold">
            {t("quick_sql_templates")}
          </span>
          <span className="pg-badge">NEW</span>
        </div>
        <div className="text-[10px] opacity-60">
          {sqlTemplates.length} {t("sql_template_count")}
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {sqlCategories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => pickCategory(cat.id)}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
              category === cat.id
                ? "border-transparent pg-badge"
                : "border-color opacity-70 hover:opacity-100"
            }`}
          >
            {t(cat.labelKey)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {templates.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            title={tpl.description}
            onClick={() => pickChip(tpl)}
            className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
              templateId === tpl.id
                ? "pg-menu-trigger border-transparent"
                : "border-color hover:border-blue-400"
            }`}
          >
            {tpl.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] opacity-60 leading-snug flex-1">
          {t("sql_quick_hint")}
        </div>
        <Button
          size="small"
          theme="solid"
          icon={<IconEdit />}
          disabled={disabled}
          onClick={() => setFormOpen(true)}
        >
          {t("sql_form_builder")}
        </Button>
      </div>

      <Modal
        title={`${t("sql_form_builder")} · ${template?.label ?? ""}`}
        visible={formOpen}
        onCancel={() => setFormOpen(false)}
        footer={null}
        width={720}
      >
        {template && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1">
              {sqlCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => pickCategory(cat.id)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                    category === cat.id
                      ? "border-transparent pg-badge"
                      : "border-color opacity-70 hover:opacity-100"
                  }`}
                >
                  {t(cat.labelKey)}
                </button>
              ))}
            </div>

            <Select
              size="small"
              className="w-full"
              value={template.id}
              onChange={(v) => setTemplateId(v)}
              optionList={templates.map((item) => ({
                value: item.id,
                label: item.label,
              }))}
              filter
            />

            <TemplateForm
              key={template.id}
              template={template}
              tables={tables}
              disabled={disabled}
              onRun={(sql) => {
                onRun(sql);
                setFormOpen(false);
              }}
              onInsert={(sql) => {
                onInsert(sql);
                setFormOpen(false);
              }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
