import { useMemo, useState } from "react";
import { Button, Radio, RadioGroup, Spin, Toast } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import {
  useDiagram,
  useEnums,
  usePostgres,
  useTypes,
  useViews,
} from "../../../hooks";
import { DB, MODAL } from "../../../data/constants";
import { exportSQL } from "../../../utils/exportSQL";
import { dropSchema, runQuery } from "../../../api/postgres";
import CodeEditor from "../../CodeEditor";

export default function SchemaSync({ setModal }) {
  const { t } = useTranslation();
  const { tables, relationships } = useDiagram();
  const { enums } = useEnums();
  const { types } = useTypes();
  const { views } = useViews();
  const { connection, connected, openConnectionModal } = usePostgres();
  const [mode, setMode] = useState("create_if_missing");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);

  const ddl = useMemo(
    () =>
      exportSQL({
        tables,
        references: relationships,
        types,
        database: DB.POSTGRES,
        enums,
        views,
        sqlHeader: "",
      }),
    [tables, relationships, types, enums, views],
  );

  const apply = async () => {
    if (!connected) {
      setModal(MODAL.NONE);
      openConnectionModal();
      return;
    }
    setApplying(true);
    setError(null);
    setSummary(null);
    try {
      if (mode === "recreate") {
        await dropSchema(connection, connection.schema || "public");
      }
      const res = await runQuery(connection, ddl);
      setSummary(res.results);
      Toast.success(t("apply_success"));
    } catch (e) {
      setError(e);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="flex flex-col gap-3" style={{ direction: "ltr" }}>
      <p className="text-sm m-0">{t("apply_schema_description")}</p>

      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="rounded bg-zinc-100 dark:bg-neutral-800 p-2">
          <div className="text-lg font-semibold">{tables.length}</div>
          <div className="text-[11px] opacity-60">
            {t("tables_count_label")}
          </div>
        </div>
        <div className="rounded bg-zinc-100 dark:bg-neutral-800 p-2">
          <div className="text-lg font-semibold">{enums.length}</div>
          <div className="text-[11px] opacity-60">{t("enums_count_label")}</div>
        </div>
        <div className="rounded bg-zinc-100 dark:bg-neutral-800 p-2">
          <div className="text-lg font-semibold">{types.length}</div>
          <div className="text-[11px] opacity-60">{t("types_count_label")}</div>
        </div>
        <div className="rounded bg-zinc-100 dark:bg-neutral-800 p-2">
          <div className="text-lg font-semibold">{relationships.length}</div>
          <div className="text-[11px] opacity-60">
            {t("foreign_keys_count_label")}
          </div>
        </div>
      </div>

      <RadioGroup
        value={mode}
        onChange={(e) => setMode(e.target.value)}
        direction="vertical"
      >
        <Radio value="create_if_missing">{t("create_if_missing")}</Radio>
        <Radio value="recreate">{t("recreate_schema")}</Radio>
      </RadioGroup>

      {mode === "recreate" && (
        <div className="text-xs rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-2">
          {t("recreate_warning", { schema: connection.schema || "public" })}
        </div>
      )}

      <div
        className="rounded overflow-hidden border border-color"
        style={{ height: 200 }}
      >
        <CodeEditor
          height="100%"
          language="sql"
          value={ddl}
          formatOnMount={false}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            lineNumbers: "off",
          }}
        />
      </div>

      {error && (
        <div className="text-xs rounded border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-900 p-2">
          <div className="font-semibold">{t("apply_error")}</div>
          <div className="whitespace-pre-wrap break-words">{error.message}</div>
          {error.position && (
            <div className="opacity-70">@{error.position}</div>
          )}
        </div>
      )}

      {summary && (
        <div className="text-xs rounded border border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-900 p-2 max-h-32 overflow-auto">
          {summary.map((result, index) => (
            <div key={index} className="font-mono">
              {result.command ?? "OK"}
              {result.rowCount !== null ? ` (${result.rowCount})` : ""}
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2 mt-1">
        <Button theme="borderless" onClick={() => setModal(MODAL.NONE)}>
          {t("close")}
        </Button>
        <Button theme="solid" loading={applying} onClick={apply}>
          {applying ? t("applying") : t("apply")}
        </Button>
      </div>
      {applying && (
        <div className="text-center">
          <Spin size="small" />
        </div>
      )}
    </div>
  );
}
