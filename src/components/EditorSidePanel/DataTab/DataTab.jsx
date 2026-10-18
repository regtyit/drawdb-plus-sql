import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Modal, Select, Spin, Toast, Tooltip } from "@douyinfe/semi-ui";
import {
  IconPlus,
  IconRefresh,
  IconEdit,
  IconDelete,
} from "@douyinfe/semi-icons";
import { useTranslation } from "react-i18next";
import { usePostgres } from "../../../hooks";
import {
  listTables,
  fetchRows,
  insertRow,
  updateRow,
  deleteRow,
} from "../../../api/postgres";
import ResultGrid from "../PostgresTab/ResultGrid";
import RowEditorModal from "./RowEditorModal";
import PostgresHelpCard from "../../Postgres/HelpCard";

const PAGE_SIZE = 50;

function Step({ index, children }) {
  return (
    <div className="pg-step text-xs">
      <span className="pg-step-index">{index}</span>
      <span className="leading-5">{children}</span>
    </div>
  );
}

export default function DataTab() {
  const { t } = useTranslation();
  const { connection, connected } = usePostgres();
  const [tables, setTables] = useState([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState({
    visible: false,
    mode: "insert",
    row: null,
  });
  const [submitting, setSubmitting] = useState(false);

  const selectedTable = useMemo(
    () => tables.find((tbl) => `${tbl.schema}.${tbl.name}` === selectedKey),
    [tables, selectedKey],
  );

  const loadTables = useCallback(async () => {
    if (!connected) return;
    try {
      setError(null);
      const res = await listTables(
        connection,
        [connection.schema].filter(Boolean),
      );
      setTables(res.tables ?? []);
    } catch (e) {
      setError(e);
    }
  }, [connected, connection]);

  const loadRows = useCallback(
    async (table, currentPage = 0) => {
      if (!connected || !table) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetchRows(connection, {
          schema: table.schema,
          table: table.name,
          limit: PAGE_SIZE,
          offset: currentPage * PAGE_SIZE,
        });
        setData(res);
      } catch (e) {
        setError(e);
      } finally {
        setLoading(false);
      }
    },
    [connected, connection],
  );

  useEffect(() => {
    if (connected) {
      loadTables();
    } else {
      setTables([]);
      setSelectedKey("");
      setData(null);
    }
  }, [connected, loadTables]);

  useEffect(() => {
    if (selectedTable) {
      setPage(0);
      loadRows(selectedTable, 0);
    }
  }, [selectedTable, loadRows]);

  const refresh = () => {
    loadTables();
    if (selectedTable) loadRows(selectedTable, page);
  };

  const pkValuesFromRow = (row) => {
    const pk = {};
    for (const column of data?.primaryKey ?? []) {
      pk[column] = row[column];
    }
    return pk;
  };

  const hasPrimaryKey = (data?.primaryKey?.length ?? 0) > 0;

  const onSubmitEditor = async (values) => {
    if (!selectedTable) return;
    setSubmitting(true);
    try {
      if (editor.mode === "insert") {
        await insertRow(connection, {
          schema: selectedTable.schema,
          table: selectedTable.name,
          values,
        });
        Toast.success(t("insert_row_success"));
      } else {
        await updateRow(connection, {
          schema: selectedTable.schema,
          table: selectedTable.name,
          values,
          primaryKey: pkValuesFromRow(editor.row),
        });
        Toast.success(t("update_row_success"));
      }
      setEditor({ visible: false, mode: "insert", row: null });
      await loadRows(selectedTable, page);
    } catch (e) {
      Toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = (row) => {
    Modal.confirm({
      title: t("delete_row"),
      content: t("confirm_delete_row"),
      onOk: async () => {
        try {
          await deleteRow(connection, {
            schema: selectedTable.schema,
            table: selectedTable.name,
            primaryKey: pkValuesFromRow(row),
          });
          Toast.success(t("delete_row_success"));
          await loadRows(selectedTable, page);
        } catch (e) {
          Toast.error(e.message);
        }
      },
    });
  };

  if (!connected) {
    return (
      <div className="flex flex-col gap-3 h-full">
        <PostgresHelpCard />
      </div>
    );
  }

  const actions = {
    header: "",
    width: 110,
    render: (row) => (
      <div className="flex items-center gap-1">
        <Tooltip content={t("edit_row")}>
          <Button
            size="small"
            theme="borderless"
            disabled={!hasPrimaryKey}
            icon={<IconEdit />}
            onClick={() => setEditor({ visible: true, mode: "edit", row })}
          />
        </Tooltip>
        <Tooltip content={t("delete_row")}>
          <Button
            size="small"
            theme="borderless"
            type="danger"
            disabled={!hasPrimaryKey}
            icon={<IconDelete />}
            onClick={() => onDelete(row)}
          />
        </Tooltip>
      </div>
    ),
  };

  const totalPages = data ? Math.max(Math.ceil(data.total / PAGE_SIZE), 1) : 1;

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-center gap-2">
        <Select
          value={selectedKey || undefined}
          onChange={(value) => setSelectedKey(value)}
          placeholder={t("select_table")}
          style={{ flex: 1 }}
          filter
          optionList={tables.map((tbl) => ({
            value: `${tbl.schema}.${tbl.name}`,
            label: `${tbl.schema}.${tbl.name}`,
          }))}
        />
        <Button theme="borderless" icon={<IconRefresh />} onClick={refresh} />
      </div>

      {!selectedTable && (
        <div className="pg-highlight p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{t("data_browser")}</span>
            <span className="pg-badge">NEW</span>
          </div>
          <Step index="1">{t("data_step_select")}</Step>
          <Step index="2">{t("data_step_edit")}</Step>
          <Step index="3">{t("data_step_delete")}</Step>
        </div>
      )}

      {selectedTable && (
        <>
          <div className="flex items-center justify-between gap-2">
            <Button
              size="small"
              icon={<IconPlus />}
              onClick={() =>
                setEditor({ visible: true, mode: "insert", row: null })
              }
            >
              {t("add_row")}
            </Button>
            {!hasPrimaryKey && (
              <span className="text-[11px] opacity-60">
                {t("no_primary_key")}
              </span>
            )}
          </div>

          {error && (
            <div className="text-xs rounded border border-red-300 bg-red-50 dark:bg-red-950/40 p-2">
              {error.message}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-auto">
            {loading ? (
              <div className="text-center py-6">
                <Spin size="small" />
              </div>
            ) : (
              data && (
                <ResultGrid
                  fields={data.columns}
                  rows={data.rows}
                  actions={actions}
                  maxHeight={420}
                />
              )
            )}
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="opacity-60">
              {t("row_count", { count: data?.total ?? 0 })}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="small"
                disabled={page === 0}
                onClick={() => {
                  const next = page - 1;
                  setPage(next);
                  loadRows(selectedTable, next);
                }}
              >
                {t("previous")}
              </Button>
              <span className="opacity-70">
                {page + 1} / {totalPages}
              </span>
              <Button
                size="small"
                disabled={page + 1 >= totalPages}
                onClick={() => {
                  const next = page + 1;
                  setPage(next);
                  loadRows(selectedTable, next);
                }}
              >
                {t("next")}
              </Button>
            </div>
          </div>
        </>
      )}

      <RowEditorModal
        visible={editor.visible}
        mode={editor.mode}
        columns={data?.columns ?? []}
        primaryKey={data?.primaryKey ?? []}
        initialValues={editor.row}
        submitting={submitting}
        onCancel={() =>
          setEditor({ visible: false, mode: "insert", row: null })
        }
        onSubmit={onSubmitEditor}
      />
    </div>
  );
}
