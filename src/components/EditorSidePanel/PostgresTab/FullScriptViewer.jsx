import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banner,
  Button,
  InputNumber,
  Modal,
  Spin,
  Switch,
  Toast,
} from "@douyinfe/semi-ui";
import { IconRefresh } from "@douyinfe/semi-icons";
import { useTranslation } from "react-i18next";
import { useDiagram, useEnums, usePostgres, useTypes } from "../../../hooks";
import { introspectSchema, listTables, runQuery } from "../../../api/postgres";
import { catalogToDiagram } from "../../../utils/postgres/introspect";
import { buildMigration } from "../../../utils/postgres/migrate";
import {
  buildInitScript,
  composeFullScript,
  qualifiedTableName,
} from "../../../utils/postgres/scriptDump";
import { quoteIdent } from "../../../utils/postgres/sqlTemplates/value";
import { schemaSearchPath } from "../../../utils/postgres/schemaPath";
import CodeEditor from "../../CodeEditor";
import ResultGrid from "./ResultGrid";

const GROUP_LABELS = [
  "table",
  "column",
  "primary_key",
  "foreign_key",
  "index",
  "enum",
  "type",
];

export default function FullScriptViewer({ onClose }) {
  const { t } = useTranslation();
  const { tables, relationships } = useDiagram();
  const { enums } = useEnums();
  const { types } = useTypes();
  const { connection } = usePostgres();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [script, setScript] = useState("");
  const [migration, setMigration] = useState(null);
  const [includeData, setIncludeData] = useState(true);
  const [dataLimit, setDataLimit] = useState(10);
  const [includeDrops, setIncludeDrops] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState(null);
  const [results, setResults] = useState([]);

  const desired = useMemo(
    () => ({ tables, relationships, enums, types }),
    [tables, relationships, enums, types],
  );

  const fetchSeedRows = async (tableName) => {
    const target = qualifiedTableName(tableName);
    const limit = Math.min(Math.max(Number(dataLimit) || 0, 0), 100);
    const order = tableName.primaryKey?.length
      ? ` ORDER BY ${tableName.primaryKey.map(quoteIdent).join(", ")} DESC`
      : "";
    const res = await runQuery(
      connection,
      `SELECT * FROM ${target}${order} LIMIT ${limit}`,
    );
    return res.results?.[0]?.rows ?? [];
  };

  const loadScript = async () => {
    setLoading(true);
    setError(null);
    setRunError(null);
    setResults([]);
    try {
      const schema = connection.schema || "public";
      const { catalog } = await introspectSchema(connection, [schema]);
      const { tables: liveTables } = await listTables(connection, [schema]);

      const rowsByTable = {};
      if (includeData && dataLimit > 0) {
        for (const liveTable of liveTables) {
          rowsByTable[`${liveTable.schema}.${liveTable.name}`] =
            await fetchSeedRows(liveTable);
        }
      }

      const actual = catalogToDiagram(catalog);
      const pending = buildMigration(desired, actual, catalog, {
        includeDrops,
      });
      const { createSql, insertSql } = buildInitScript({
        catalog,
        rowsByTable,
        includeData,
      });

      setMigration(pending);
      setScript(
        composeFullScript({
          initSql: createSql,
          insertSql,
          operationSql: pending.sql,
          rowsPerTable: includeData
            ? Math.min(Math.max(Number(dataLimit) || 0, 0), 100)
            : 0,
          includeOperations: true,
        }),
      );
    } catch (e) {
      setError(e);
      setScript("");
      setMigration(null);
    } finally {
      setLoading(false);
    }
  };

  const loadRef = useRef(loadScript);
  loadRef.current = loadScript;

  useEffect(() => {
    loadRef.current();
  }, [includeDrops]);

  const runScript = async () => {
    if (!script.trim()) return;
    setRunning(true);
    setRunError(null);
    setResults([]);
    try {
      const res = await runQuery(connection, script, {
        searchPath: schemaSearchPath(connection.schema),
      });
      setResults(res.results ?? []);
      Toast.success(t("script_run_success"));
    } catch (e) {
      setRunError(e);
    } finally {
      setRunning(false);
    }
  };

  const copyScript = () => {
    if (!script) return;
    navigator.clipboard.writeText(script).then(
      () => Toast.success(t("copied_to_clipboard")),
      (e) => console.error(e),
    );
  };

  const downloadScript = () => {
    if (!script) return;
    const blob = new Blob([script], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `drawdb-plus-sql-${new Date().toISOString().slice(0, 10)}.sql`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const opCount = migration?.operations?.length ?? 0;

  return (
    <Modal
      title={t("full_script_title")}
      visible
      onCancel={onClose}
      footer={null}
      width={860}
    >
      <div className="flex flex-col gap-3" style={{ direction: "ltr" }}>
        <p className="text-sm m-0">{t("full_script_description")}</p>

        <div className="flex items-center gap-4 flex-wrap">
          <Switch checked={includeData} onChange={setIncludeData} />
          <div className="text-xs">{t("seed_data")}</div>
          {includeData && (
            <>
              <div className="text-xs">{t("rows_per_table")}</div>
              <InputNumber
                size="small"
                min={1}
                max={100}
                style={{ width: 92 }}
                value={dataLimit}
                onChange={(v) => setDataLimit(v ?? 10)}
              />
            </>
          )}
          <Switch checked={includeDrops} onChange={setIncludeDrops} />
          <div className="text-xs">{t("include_drops")}</div>
          <Button
            size="small"
            icon={<IconRefresh />}
            loading={loading}
            onClick={loadScript}
          >
            {t("refresh")}
          </Button>
        </div>

        {error && (
          <Banner type="alert" closeIcon={null} description={error.message} />
        )}

        {migration && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {GROUP_LABELS.map((group) => {
                const count = migration.summary?.[group] ?? 0;
                if (!count) return null;
                return (
                  <div
                    key={group}
                    className="pg-badge text-[10px] px-2 py-0.5 rounded-full"
                  >
                    {t(`migration_group_${group}`)}: {count}
                  </div>
                );
              })}
              <span className="text-[11px] opacity-60">
                {t("migration_statement_count", { count: opCount })}
              </span>
            </div>
            {opCount > 0 && (
              <div className="flex flex-col gap-0.5 text-[11px] max-h-24 overflow-y-auto border rounded p-2">
                {migration.operations.map((operation) => (
                  <div key={operation.id} className="flex items-center gap-1.5">
                    {operation.destructive && (
                      <span className="text-red-500">DROP</span>
                    )}
                    <span className="mono">{operation.label}</span>
                  </div>
                ))}
              </div>
            )}
            {opCount === 0 && (
              <div className="text-[11px] opacity-60">
                {t("no_pending_operations")}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="text-center py-10">
            <Spin size="small" />
          </div>
        ) : (
          <div
            className="rounded overflow-hidden border border-color"
            style={{ height: 380 }}
          >
            <CodeEditor
              height="100%"
              language="sql"
              value={script}
              formatOnMount={false}
              onChange={() => {}}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: "on",
              }}
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button size="small" onClick={copyScript} disabled={!script}>
            {t("copy")}
          </Button>
          <Button size="small" onClick={downloadScript} disabled={!script}>
            {t("download")}
          </Button>
          <Button
            size="small"
            theme="solid"
            icon={<IconRefresh />}
            loading={running}
            disabled={!script}
            onClick={runScript}
          >
            {t("run")}
          </Button>
        </div>

        {runError && (
          <Banner
            type="alert"
            closeIcon={null}
            description={runError.message}
          />
        )}
        {results.length > 0 && (
          <div className="flex flex-col gap-2">
            {results.slice(0, 5).map((result, index) => (
              <div key={index} className="flex flex-col gap-1">
                <div className="text-[11px] opacity-60 font-mono">
                  {result.command ?? "RESULT"} · {result.rowCount ?? 0}
                </div>
                {result.fields?.length > 0 && (
                  <ResultGrid
                    fields={result.fields}
                    rows={result.rows}
                    maxHeight={200}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
