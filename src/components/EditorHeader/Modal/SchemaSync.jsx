import { useEffect, useMemo, useState } from "react";
import { Button, Radio, RadioGroup, Spin, Toast } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import {
  useDiagram,
  useEnums,
  useLayout,
  usePostgres,
  useTypes,
  useUndoRedo,
  useViews,
} from "../../../hooks";
import { Action, DB, MODAL, ObjectType } from "../../../data/constants";
import { exportSQL } from "../../../utils/exportSQL";
import { errorContext } from "../../../utils/postgres/errorContext";
import { validateSql } from "../../../utils/postgres/validateSql";
import {
  diagnoseDiagram,
  reverseRelationship,
} from "../../../utils/postgres/diagnoseDiagram";
import {
  quoteIdentifier,
  schemaSearchPath,
} from "../../../utils/postgres/schemaPath";
import { dropSchema, runQuery } from "../../../api/postgres";
import CodeEditor from "../../CodeEditor";

export default function SchemaSync({ setModal }) {
  const { t } = useTranslation();
  const { tables, relationships, updateField, updateRelationship } =
    useDiagram();
  const { enums } = useEnums();
  const { types } = useTypes();
  const { views } = useViews();
  const { layout } = useLayout();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { connection, connected, openConnectionModal } = usePostgres();
  const [mode, setMode] = useState("create_if_missing");
  const [applying, setApplying] = useState(false);
  const [validating, setValidating] = useState(false);
  const [autoCheck, setAutoCheck] = useState("idle");
  const [error, setError] = useState(null);
  // Preflight failures never touch the database, so they deserve a different
  // label than a failed Apply.
  const [errorStage, setErrorStage] = useState("validate");
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
        // A second Apply must not fail on already-created enums, indexes and
        // foreign keys, so the execution copy of the DDL is idempotent.
        idempotent: true,
      }),
    [tables, relationships, types, enums, views],
  );

  const issues = useMemo(
    () => diagnoseDiagram({ tables, relationships }),
    [tables, relationships],
  );
  const autoFixable = issues.filter(
    (issue) =>
      issue.kind === "unsupported_check" ||
      (issue.kind === "fk_not_unique" && issue.canSwap),
  ).length;

  const ctx = error?.position ? errorContext(ddl, error.position) : null;

  // Validate as soon as the dialog opens and whenever the diagram changes, so
  // an impossible design is visible before the user presses Apply.
  useEffect(() => {
    if (!connected) {
      setAutoCheck("idle");
      return undefined;
    }
    let cancelled = false;
    setAutoCheck("checking");
    validateSql(connection, ddl)
      .then(() => {
        if (cancelled) return;
        setAutoCheck("ok");
        setError(null);
        setSummary(null);
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
  }, [connected, connection, ddl]);

  const runValidate = async () => {
    setValidating(true);
    setAutoCheck("checking");
    setError(null);
    setSummary(null);
    try {
      await validateSql(connection, ddl);
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

  const onValidate = async () => {
    if (!connected) {
      setModal(MODAL.NONE);
      openConnectionModal();
      return;
    }
    await runValidate();
  };

  const fixDiagram = () => {
    if (layout.readOnly) return;
    const entries = [];

    for (const issue of issues) {
      if (issue.kind === "unsupported_check") {
        const table = tables.find((item) => item.id === issue.tableId);
        const field = table?.fields?.find((item) => item.id === issue.fieldId);
        if (!table || !field) continue;
        updateField(issue.tableId, issue.fieldId, { check: "" });
        entries.push({
          action: Action.EDIT,
          element: ObjectType.TABLE,
          component: "field",
          tid: issue.tableId,
          fid: issue.fieldId,
          undo: { check: field.check },
          redo: { check: "" },
          message: t("edit_table", {
            tableName: table.name,
            extra: "[PostgreSQL fix]",
          }),
        });
      } else if (issue.kind === "fk_not_unique" && issue.canSwap) {
        const relationship = relationships.find(
          (item) => item.id === issue.relationshipId,
        );
        if (!relationship) continue;
        const undo = {
          startTableId: relationship.startTableId,
          endTableId: relationship.endTableId,
          startFieldId: relationship.startFieldId,
          endFieldId: relationship.endFieldId,
          cardinality: relationship.cardinality,
        };
        if (Array.isArray(relationship.fields)) {
          undo.fields = relationship.fields.map((pair) => ({ ...pair }));
        }
        const redo = reverseRelationship(relationship);
        updateRelationship(issue.relationshipId, redo);
        entries.push({
          action: Action.EDIT,
          element: ObjectType.RELATIONSHIP,
          rid: issue.relationshipId,
          undo,
          redo,
          message: t("edit_relationship", {
            refName:
              relationship.name ??
              `fk_${issue.startTableName}_${issue.endTableName}`,
            extra: "[PostgreSQL fix]",
          }),
        });
      }
    }

    if (entries.length === 0) {
      Toast.warning(t("fix_diagram_none"));
      return;
    }
    setUndoStack((prev) => [...prev, ...entries]);
    setRedoStack([]);
    Toast.success(t("fix_diagram_success", { count: entries.length }));
  };

  const ensureSchema = async () => {
    const schema = connection.schema?.trim();
    if (!schema || schema === "public") return;
    await runQuery(
      connection,
      `CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schema)};`,
    );
  };

  const apply = async () => {
    if (!connected) {
      setModal(MODAL.NONE);
      openConnectionModal();
      return;
    }
    setApplying(true);
    setError(null);
    setErrorStage("apply");
    setSummary(null);
    try {
      if (mode === "recreate") {
        await dropSchema(connection, connection.schema || "public");
      }
      await ensureSchema();
      const res = await runQuery(connection, ddl, {
        searchPath: schemaSearchPath(connection.schema),
      });
      setSummary(res.results);
      Toast.success(t("apply_success"));
    } catch (e) {
      setError(e);
    } finally {
      setApplying(false);
    }
  };

  const issueDescription = (issue) => {
    if (issue.kind === "unsupported_check") {
      if (issue.subquery) {
        return t("diagram_issue_check_subquery", {
          table: issue.tableName,
          field: issue.fieldName,
        });
      }
      if (issue.references.length > 0) {
        return t("diagram_issue_check_other", {
          table: issue.tableName,
          field: issue.fieldName,
          ref: issue.references.join(", "),
        });
      }
      return t("diagram_issue_check_qualified", {
        table: issue.tableName,
        field: issue.fieldName,
      });
    }
    const from = `${issue.startTableName}(${issue.startColumns.join(", ")})`;
    const to = `${issue.endTableName}(${issue.endColumns.join(", ")})`;
    if (issue.canSwap) {
      return t("diagram_issue_fk_reversed", { from, to });
    }
    return t("diagram_issue_fk_missing_unique", { from, to });
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

      <div className="text-xs rounded border border-color p-2 opacity-80">
        {t("apply_existing_table_hint")}{" "}
        <button
          type="button"
          className="underline font-medium"
          onClick={() => setModal(MODAL.SCHEMA_MIGRATION)}
        >
          {t("update_schema_from_postgres")}
        </button>
      </div>

      {issues.length > 0 && (
        <div className="text-xs rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-2">
          <div className="font-semibold">{t("diagram_issues_title")}</div>
          <ul className="m-0 mt-1 pl-4 list-disc">
            {issues.map((issue, index) => (
              <li key={`${issue.kind}-${index}`}>{issueDescription(issue)}</li>
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {autoFixable > 0 && (
              <Button
                size="small"
                theme="solid"
                disabled={layout.readOnly}
                onClick={fixDiagram}
              >
                {t("fix_diagram")}
              </Button>
            )}
            <span className="opacity-70">{t("fix_diagram_hint")}</span>
          </div>
        </div>
      )}

      {!connected && (
        <div className="text-xs rounded border border-color p-2 opacity-70">
          {t("connect_required_hint")}
        </div>
      )}

      {connected && autoCheck === "checking" && (
        <div className="text-xs rounded border border-color p-2 opacity-70 flex items-center gap-2">
          <Spin size="small" />
          {t("preflight_checking")}
        </div>
      )}
      {connected && autoCheck === "ok" && (
        <div className="text-xs rounded border border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-900 p-2">
          {t("preflight_ok")}
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
          <div className="font-semibold">
            {t(errorStage === "apply" ? "apply_error" : "preflight_error")}
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
        <Button loading={validating} onClick={onValidate}>
          {validating ? t("validating") : t("validate")}
        </Button>
        <Button theme="solid" loading={applying} onClick={apply}>
          {applying ? t("applying") : t("apply")}
        </Button>
      </div>
      {(applying || validating) && (
        <div className="text-center">
          <Spin size="small" />
        </div>
      )}
    </div>
  );
}
