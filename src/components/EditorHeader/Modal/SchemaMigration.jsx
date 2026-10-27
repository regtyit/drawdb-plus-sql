import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Radio, RadioGroup, Spin, Toast } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { useDiagram, useEnums, usePostgres, useTypes } from "../../../hooks";
import { MODAL } from "../../../data/constants";
import { introspectSchema, runQuery } from "../../../api/postgres";
import { catalogToDiagram } from "../../../utils/postgres/introspect";
import { buildMigration } from "../../../utils/postgres/migrate";
import { errorContext } from "../../../utils/postgres/errorContext";
import { validateSql } from "../../../utils/postgres/validateSql";
import { schemaSearchPath } from "../../../utils/postgres/schemaPath";
import CodeEditor from "../../CodeEditor";

const GROUP_LABELS = [
  "table",
  "column",
  "primary_key",
  "foreign_key",
  "index",
  "check",
  "enum",
  "type",
];

export default function SchemaMigration({ setModal }) {
  const { t } = useTranslation();
  const { tables, relationships } = useDiagram();
  const { enums } = useEnums();
  const { types } = useTypes();
  // views not used in migration calculation
  const { connection, connected, openConnectionModal } = usePostgres();
  const [includeDrops, setIncludeDrops] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [validating, setValidating] = useState(false);
  const [autoCheck, setAutoCheck] = useState("idle");
  const [error, setError] = useState(null);
  const [errorStage, setErrorStage] = useState("validate");
  const [summary, setSummary] = useState(null);
  const [migration, setMigration] = useState(null);
  const ctx = error?.position
    ? errorContext(migration?.sql, error.position)
    : null;

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
      setErrorStage("load");
      setError(e);
      setMigration(null);
    } finally {
      setLoading(false);
    }
  }, [connected, connection, desired, includeDrops]);

  useEffect(() => {
    compute();
  }, [compute]);

  // Validate every generated diff immediately (inside a rolled-back
  // transaction) so the user sees whether it is safe before applying.
  useEffect(() => {
    if (!connected || !migration?.sql) {
      setAutoCheck("idle");
      return undefined;
    }
    let cancelled = false;
    setAutoCheck("checking");
    validateSql(connection, migration.sql)
      .then(() => {
        if (cancelled) return;
        setAutoCheck("ok");
      })
      .catch((e) => {
        if (cancelled) return;
        setAutoCheck("failed");
        setErrorStage("validate");
        setError(e);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, connection, migration?.sql]);

  const onValidateMigration = async () => {
    if (!connected) {
      setModal(MODAL.NONE);
      openConnectionModal();
      return;
    }
    if (!migration?.sql) return;
    setValidating(true);
    setAutoCheck("checking");
    setError(null);
    setSummary(null);
    try {
      await validateSql(connection, migration.sql);
      setAutoCheck("ok");
      Toast.success(t("validate_success"));
    } catch (e) {
      setAutoCheck("failed");
      setErrorStage("validate");
      setError(e);
    } finally {
      setValidating(false);
    }
  };

  const apply = async () => {
    if (!connected) {
      setModal(MODAL.NONE);
      openConnectionModal();
      return;
    }
    if (!migration?.sql) return;
    setApplying(true);
    setError(null);
    setErrorStage("apply");
    setSummary(null);
    try {
      const res = await runQuery(connection, migration.sql, {
        searchPath: schemaSearchPath(connection.schema),
      });
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

      {connected && migration?.hasChanges && autoCheck === "checking" && (
        <div className="text-xs rounded border border-color p-2 opacity-70 flex items-center gap-2">
          <Spin size="small" />
          {t("preflight_checking")}
        </div>
      )}
      {connected && migration?.hasChanges && autoCheck === "ok" && (
        <div className="text-xs rounded border border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-900 p-2">
          {t("preflight_ok")}
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
          <div className="font-semibold">
            {t(
              errorStage === "apply"
                ? "apply_error"
                : errorStage === "load"
                  ? "migration_load_error"
                  : "preflight_error",
            )}
          </div>
          <div className="whitespace-pre-wrap break-words">{error.message}</div>
          <div className="opacity-70">
            @{error.position && ` char ${error.position}, line ${ctx?.line}`}
          </div>
          {ctx && (
            <pre className="m-0 mt-1 p-1 rounded font-mono text-[11px] whitespace-pre-wrap break-words bg-white/60 dark:bg-black/40">
              {ctx.snippet}
            </pre>
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
          loading={validating}
          disabled={!migration?.sql}
          onClick={onValidateMigration}
        >
          {validating ? t("validating") : t("validate")}
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
      {(applying || validating || loading) && (
        <div className="text-center">
          <Spin size="small" />
        </div>
      )}
    </div>
  );
}
