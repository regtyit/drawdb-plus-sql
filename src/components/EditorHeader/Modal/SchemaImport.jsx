import { useCallback, useEffect, useState } from "react";
import { Button, Select, Spin, Toast } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import {
  useAreas,
  useDiagram,
  useEnums,
  useNotes,
  usePostgres,
  useTransform,
  useTypes,
  useUndoRedo,
  useViews,
} from "../../../hooks";
import { DB, MODAL } from "../../../data/constants";
import { introspectSchema } from "../../../api/postgres";
import { getSchemas } from "../../../api/postgres";
import { catalogToDiagram } from "../../../utils/postgres/introspect";

export default function SchemaImport({ setModal }) {
  const { t } = useTranslation();
  const { setTables, setRelationships, setDatabase, setSqlHeader } =
    useDiagram();
  const { setEnums } = useEnums();
  const { setTypes } = useTypes();
  const { setViews } = useViews();
  const { setNotes } = useNotes();
  const { setAreas } = useAreas();
  const { setTransform } = useTransform();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { connection, connected, openConnectionModal } = usePostgres();

  const [available, setAvailable] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);

  const loadSchemas = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getSchemas(connection);
      const list = res.schemas ?? [];
      setAvailable(list);
      const preferred =
        connection.schema && list.includes(connection.schema)
          ? [connection.schema]
          : list.includes("public")
            ? ["public"]
            : list.slice(0, 1);
      setSelected(preferred);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [connected, connection]);

  useEffect(() => {
    loadSchemas();
  }, [loadSchemas]);

  const doImport = async () => {
    if (!connected) {
      setModal(MODAL.NONE);
      openConnectionModal();
      return;
    }
    if (selected.length === 0) {
      setError({ message: t("select_at_least_one_schema") });
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const { catalog } = await introspectSchema(connection, selected);
      const diagram = catalogToDiagram(catalog);
      setDatabase(DB.POSTGRES);
      setTables(diagram.tables);
      setRelationships(diagram.relationships);
      setEnums(diagram.enums ?? []);
      setTypes(diagram.types ?? []);
      setViews([]);
      setNotes([]);
      setAreas([]);
      setSqlHeader("");
      setTransform((prev) => ({ ...prev, pan: { x: 0, y: 0 } }));
      setUndoStack([]);
      setRedoStack([]);
      Toast.success(t("import_success"));
      if (diagram.skippedViews?.length) {
        Toast.warning(t("views_not_imported"), { duration: 6 });
      }
      setModal(MODAL.NONE);
    } catch (e) {
      setError(e);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3" style={{ direction: "ltr" }}>
      <p className="text-sm m-0">{t("import_schema_description")}</p>

      {loading ? (
        <div className="text-center py-4">
          <Spin size="small" />
        </div>
      ) : (
        <>
          <label className="text-xs font-medium opacity-80">
            {t("schemas_to_import")}
          </label>
          <Select
            multiple
            value={selected}
            onChange={(value) => setSelected(value)}
            style={{ width: "100%" }}
            placeholder={t("select_at_least_one_schema")}
            optionList={available.map((name) => ({ value: name, label: name }))}
          />
        </>
      )}

      {error && (
        <div className="text-xs rounded border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-900 p-2">
          {error.message}
        </div>
      )}

      <div className="flex justify-end gap-2 mt-1">
        <Button theme="borderless" onClick={() => setModal(MODAL.NONE)}>
          {t("cancel")}
        </Button>
        <Button theme="solid" loading={importing} onClick={doImport}>
          {importing ? t("importing") : t("import")}
        </Button>
      </div>
    </div>
  );
}
