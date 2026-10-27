import { useCallback, useState } from "react";
import { Toast } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import {
  useAreas,
  useDiagram,
  useEnums,
  useNotes,
  usePostgres,
  useSelect,
  useTransform,
  useTypes,
  useUndoRedo,
  useViews,
} from ".";
import { DB, ObjectType, Tab } from "../data/constants";
import { introspectSchema } from "../api/postgres";
import { catalogToDiagram } from "../utils/postgres/introspect";

/**
 * Import a live PostgreSQL schema into the diagram (replace semantics).
 * Shared by the SQL console's one-click import and the header modal.
 */
export default function useSchemaImport() {
  const { t } = useTranslation();
  const { connection, connected } = usePostgres();
  const { setTables, setRelationships, setDatabase, setSqlHeader } =
    useDiagram();
  const { setEnums } = useEnums();
  const { setTypes } = useTypes();
  const { setViews } = useViews();
  const { setNotes } = useNotes();
  const { setAreas } = useAreas();
  const { setTransform } = useTransform();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { setSelectedElement, setBulkSelectedElements } = useSelect();
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);

  const importSchemas = useCallback(
    async (schemas) => {
      if (!connected) {
        setError({ message: t("connect_required_hint") });
        return false;
      }
      setImporting(true);
      setError(null);
      try {
        const { catalog } = await introspectSchema(connection, schemas);
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
        // Release stale selections so the canvas does not reference missing tables.
        setSelectedElement({
          element: ObjectType.NONE,
          id: -1,
          openDialogue: false,
          openCollapse: false,
          currentTab: Tab.TABLES,
          open: false,
        });
        setBulkSelectedElements([]);
        const relationCount = diagram.relationships.length;
        Toast.success(
          relationCount === 1
            ? t("import_success_details_s", { tables: diagram.tables.length })
            : t("import_success_details", {
                tables: diagram.tables.length,
                relations: relationCount,
              }),
        );
        if (diagram.skippedViews?.length) {
          Toast.warning(t("views_not_imported"), { duration: 6 });
        }
        return true;
      } catch (e) {
        setError(e);
        return false;
      } finally {
        setImporting(false);
      }
    },
    [
      connected,
      connection,
      t,
      setTables,
      setRelationships,
      setDatabase,
      setSqlHeader,
      setEnums,
      setTypes,
      setViews,
      setNotes,
      setAreas,
      setTransform,
      setUndoStack,
      setRedoStack,
      setSelectedElement,
      setBulkSelectedElements,
    ],
  );

  return { importSchemas, importing, error };
}
