import { useCallback, useRef, useState } from "react";
import { Button, Spin, Tag } from "@douyinfe/semi-ui";
import { IconPlay, IconRefresh, IconBolt } from "@douyinfe/semi-icons";
import { useTranslation } from "react-i18next";
import { usePostgres } from "../../../hooks";
import { runQuery } from "../../../api/postgres";
import CodeEditor from "../../CodeEditor";
import ResultGrid from "./ResultGrid";
import PostgresHelpCard from "../../Postgres/HelpCard";
import SqlTemplateBuilder from "./SqlTemplateBuilder";

function StatusBadge({ connected, database }) {
  const { t } = useTranslation();
  return (
    <Tag color={connected ? "green" : "grey"} size="small" type="light">
      {connected ? `${t("connected")} · ${database ?? ""}` : t("disconnected")}
    </Tag>
  );
}

export default function PostgresTab() {
  const { t } = useTranslation();
  const { connection, connected, openConnectionModal, disconnect } =
    usePostgres();
  const [sql, setSql] = useState("");
  const [running, setRunning] = useState(false);
  const [resultSets, setResultSets] = useState([]);
  const [notices, setNotices] = useState([]);
  const [error, setError] = useState(null);
  const [executionTime, setExecutionTime] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const editorRef = useRef(null);

  const execute = useCallback(
    async (text) => {
      const statement = (text ?? sql).trim();
      if (!statement) return;
      if (!connected) {
        openConnectionModal();
        return;
      }
      setRunning(true);
      setError(null);
      setNotices([]);
      setResultSets([]);
      setExecutionTime(null);
      try {
        const res = await runQuery(connection, statement);
        setResultSets(res.results ?? []);
        setNotices(res.notices ?? []);
        setExecutionTime(res.executionTimeMs ?? null);
      } catch (e) {
        setError(e);
      } finally {
        setRunning(false);
      }
    },
    [sql, connected, connection, openConnectionModal],
  );

  /**
   * Insert generated SQL without overriding existing editor content:
   * an active selection is replaced, otherwise the block is appended
   * to the end of the editor, separated by a blank line.
   */
  const insertSql = useCallback((text) => {
    if (!text) return;
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) {
      setSql((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${text}` : text));
      return;
    }
    const selection = editor.getSelection();
    if (selection && !selection.isEmpty()) {
      editor.executeEdits("drawdb-template", [{ range: selection, text }]);
    } else {
      const lastLine = model.getLineCount();
      const lastColumn = model.getLineMaxColumn(lastLine);
      const hasCode = model.getValue().trim().length > 0;
      let prefix = "";
      if (hasCode) {
        prefix = model.getLineContent(lastLine).trim() ? "\n\n" : "\n";
      }
      editor.executeEdits("drawdb-template", [
        {
          range: {
            startLineNumber: lastLine,
            startColumn: lastColumn,
            endLineNumber: lastLine,
            endColumn: lastColumn,
          },
          text: `${prefix}${text}`,
        },
      ]);
    }
    setSql(model.getValue());
    editor.focus();
  }, []);

  const runRef = useRef(execute);
  runRef.current = execute;

  const runSelection = () => {
    const editor = editorRef.current;
    const selection = editor?.getSelection();
    const selected = editor?.getModel()?.getValueInRange(selection);
    const text = selected && selected.trim() ? selected : sql;
    execute(text);
  };

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-center justify-between gap-2">
        <StatusBadge connected={connected} database={connection.database} />
        {connected ? (
          <Button size="small" theme="borderless" onClick={disconnect}>
            {t("disconnect")}
          </Button>
        ) : (
          <Button size="small" theme="solid" onClick={openConnectionModal}>
            {t("connect")}
          </Button>
        )}
      </div>

      {!connected && (
        <div className="text-xs opacity-70 bg-zinc-100 dark:bg-neutral-800 rounded p-2">
          {t("not_connected_hint")}
        </div>
      )}

      <div
        className="rounded overflow-hidden border border-color"
        style={{ height: 200 }}
      >
        <CodeEditor
          height="100%"
          language="sql"
          value={sql}
          formatOnMount={false}
          onChange={(value) => setSql(value ?? "")}
          onEditorMount={(editor, monaco) => {
            editorRef.current = editor;
            editor.addCommand(
              monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
              () => runRef.current(),
            );
          }}
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: "on",
            fontSize: 13,
            wordWrap: "on",
          }}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="small"
          theme="solid"
          icon={<IconPlay />}
          loading={running}
          onClick={() => execute(sql)}
        >
          {t("run")}
        </Button>
        <Button size="small" onClick={runSelection} disabled={running}>
          {t("run_selection")}
        </Button>
        <Button
          size="small"
          theme="borderless"
          icon={<IconRefresh />}
          onClick={() => {
            setSql("");
            setResultSets([]);
            setError(null);
            setNotices([]);
            setExecutionTime(null);
          }}
        >
          {t("clear")}
        </Button>
        {connected && (
          <Button
            size="small"
            className="pg-menu-trigger"
            icon={<IconBolt />}
            onClick={() => setShowTemplates((prev) => !prev)}
          >
            {t("quick_sql_templates")}
          </Button>
        )}
      </div>

      <div className="text-[11px] opacity-50">{t("run_shortcut_hint")}</div>

      {!connected && <PostgresHelpCard />}
      {!running && connected && showTemplates && (
        <SqlTemplateBuilder
          disabled={running}
          connection={connection}
          connected={connected}
          onInsert={insertSql}
          onRun={execute}
        />
      )}

      <div className="flex-1 min-h-0 overflow-auto flex flex-col gap-2">
        {running && (
          <div className="text-center py-4">
            <Spin size="small" />
          </div>
        )}

        {error && (
          <div className="text-xs rounded border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-900 p-2 space-y-1">
            <div className="font-semibold text-red-600 dark:text-red-400">
              {t("query_error")}
            </div>
            <div className="whitespace-pre-wrap break-words">
              {error.message}
            </div>
            {error.detail && <div className="opacity-80">{error.detail}</div>}
            {error.hint && <div className="opacity-80">{error.hint}</div>}
            {error.position && (
              <div className="opacity-60">
                {t("position")}: {error.position}
              </div>
            )}
          </div>
        )}

        {notices.length > 0 && (
          <div className="text-xs rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-2">
            <div className="font-semibold mb-1">{t("notices")}</div>
            {notices.map((notice, index) => (
              <div key={index} className="whitespace-pre-wrap break-words">
                {notice.message}
              </div>
            ))}
          </div>
        )}

        {!running && executionTime !== null && (
          <div className="text-[11px] opacity-60">
            {t("execution_time", { ms: executionTime })}
          </div>
        )}

        {resultSets.map((result, index) => (
          <div key={index} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-[11px] opacity-70">
              <span className="font-mono font-semibold">
                {result.command ?? "RESULT"}
              </span>
              {result.rowCount !== null && (
                <span>{t("row_count", { count: result.rowCount })}</span>
              )}
              {result.truncated && (
                <span className="text-amber-600">
                  {t("truncated_rows", { count: result.rows.length })}
                </span>
              )}
            </div>
            {result.fields.length > 0 ? (
              <ResultGrid
                fields={result.fields}
                rows={result.rows}
                maxHeight={280}
              />
            ) : (
              <div className="text-xs opacity-60 pl-1">{t("no_result")}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
