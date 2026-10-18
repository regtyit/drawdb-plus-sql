import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Radio, RadioGroup, Spin, Toast } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { useDiagram, useEnums, usePostgres, useTypes } from "../../../hooks";
import { MODAL } from "../../../data/constants";
import { introspectSchema, runQuery } from "../../../api/postgres";
import { catalogToDiagram } from "../../../utils/postgres/introspect";
import { buildMigration } from "../../../utils/postgres/migrate";
import CodeEditor from "../../CodeEditor";

const GROUP_LABELS = [
  "table",
  "column",
  "primary_key",
  "foreign_key",
  "index",
  "enum",
  "type",
];

export default function SchemaMigration({ setModal }) {
  const { t } = useTranslation();
  const { tables, relationships } = useDiagram();
  const { enums } = useEnums();
  const { types } = useTypes();
  // views not used in migration calculation
  // views not used in migration calculation
  const { connection, connected, openConnectionModal } = usePostgres();
  const [includeDrops, setIncludeDrops] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [migration, setMigration] = useState(null);

  const desired = useMemo(
    () => ({ tables, relationships, enums, types }),
    [tables, relationships, enums, types],
  );

  const compute = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const schema = connection.schema || "public";
      const { catalog } = await introspectSchema(connection, [schema]);
      const actual = catalogToDiagram(catalog);
      setMigration(buildMigration(desired, actual, catalog, { includeDrops }));
    } catch (e) {
      setError(e);
      setMigration(null);
    } finally {
      setLoading(false);
    }
  }, [connected, connection, desired, includeDrops]);

  useEffect(() => {
    compute();
  }, [compute]);

  const apply = async () => {
    if (!connected) {
      setModal(MODAL.NONE);
      openConnectionModal();
      return;
    }
    if (!migration?.sql) return;
    setApplying(true);
    setError(null);
    setSummary(null);
    try {
      const res = await runQuery(connection, migration.sql);
      setSummary(res.results);
      Toast.success(t("apply_success"));
      await compute();
    } catch (e) {
      setError(e);
    } finally {
      setApplying(false);
    }
  };

  const opCount = migration?.operations?.length ?? 0;

  return (
    <div className="flex flex-col gap-3" style={{ direction: "ltr" }}>
      <p className="text-sm m-0">{t("migration_description")}</p>

      <div className="flex items-center gap-2">
        <Button size="small" loading={loading} onClick={compute}>
          {t("refresh")}
        </Button>
        <span className="text-xs opacity-60">
          {t("migration_statement_count", { count: opCount })}
        </span>
      </div>

      {migration?.hasChanges && (
        <div className="grid grid-cols-4 gap-2 text-center">
          {GROUP_LABELS.map((group) => (
            <div
              key={group}
              className="rounded bg-zinc-100 dark:bg-neutral-800 p-2"
            >
              <div className="text-lg font-semibold">
                {migration.summary?.[group] ?? 0}
              </div>
              <div className="text-[11px] opacity-60">
                {t(`migration_group_${group}`)}
              </div>
            </div>
          ))}
        </div>
      )}

      <RadioGroup
        value={includeDrops}
        onChange={(e) => setIncludeDrops(e.target.value)}
      >
        <Radio value={false}>{t("migration_safe_only")}</Radio>
        <Radio value>{t("migration_include_drops")}</Radio>
      </RadioGroup>

      {includeDrops && (
        <div className="text-xs rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-2">
          {t("migration_drops_warning")}
        </div>
      )}

      {!migration?.hasChanges && !loading && (
        <div className="text-xs rounded border border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-900 p-2">
          {t("migration_up_to_date")}
        </div>
      )}

      {migration?.hasChanges && (
        <div
          className="rounded overflow-hidden border border-color"
          style={{ height: 220 }}
        >
          <CodeEditor
            height="100%"
            language="sql"
            value={migration.sql}
            formatOnMount={false}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              lineNumbers: "off",
            }}
          />
        </div>
      )}

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
        <Button
          theme="solid"
          loading={applying || loading}
          disabled={!migration?.hasChanges}
          onClick={apply}
        >
          {applying ? t("applying") : t("apply")}
        </Button>
      </div>
      {(applying || loading) && (
        <div className="text-center">
          <Spin size="small" />
        </div>
      )}
    </div>
  );
}
