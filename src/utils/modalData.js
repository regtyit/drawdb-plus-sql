import { MODAL } from "../data/constants";
import i18n from "../i18n/i18n";

export const getModalTitle = (modal) => {
  switch (modal) {
    case MODAL.IMPORT:
      return i18n.t("import_diagram");
    case MODAL.IMPORT_SRC:
      return i18n.t("import_from_source");
    case MODAL.CODE:
      return i18n.t("export");
    case MODAL.IMG:
      return i18n.t("export_image");
    case MODAL.RENAME:
      return i18n.t("rename_diagram");
    case MODAL.OPEN:
      return i18n.t("open_diagram");
    case MODAL.SAVEAS:
      return i18n.t("save_as");
    case MODAL.NEW:
      return i18n.t("create_new_diagram");
    case MODAL.LANGUAGE:
      return i18n.t("language");
    case MODAL.SHARE:
      return i18n.t("share");
    case MODAL.POSTGRES_CONNECTION:
      return i18n.t("postgres_connection");
    case MODAL.SCHEMA_SYNC:
      return i18n.t("apply_schema_to_postgres");
    case MODAL.SCHEMA_IMPORT:
      return i18n.t("import_schema_from_postgres");
    case MODAL.SCHEMA_MIGRATION:
      return i18n.t("migration_title");
    default:
      return "";
  }
};

export const getModalWidth = (modal) => {
  switch (modal) {
    case MODAL.LANGUAGE:
    case MODAL.OPEN:
    case MODAL.CODE:
    case MODAL.NEW:
      return 740;
    case MODAL.POSTGRES_CONNECTION:
      return 620;
    case MODAL.SCHEMA_SYNC:
    case MODAL.SCHEMA_IMPORT:
    case MODAL.SCHEMA_MIGRATION:
      return 680;
    default:
      return 600;
  }
};

export const getOkText = (modal) => {
  switch (modal) {
    case MODAL.IMPORT:
    case MODAL.IMPORT_SRC:
      return i18n.t("import");
    case MODAL.CODE:
    case MODAL.IMG:
      return i18n.t("export");
    case MODAL.RENAME:
      return i18n.t("rename");
    case MODAL.OPEN:
      return i18n.t("open");
    case MODAL.SAVEAS:
      return i18n.t("save_as");
    case MODAL.NEW:
      return i18n.t("create");
    case MODAL.SHARE:
      return i18n.t("share");
    case MODAL.POSTGRES_CONNECTION:
      return i18n.t("connect");
    case MODAL.SCHEMA_SYNC:
      return i18n.t("apply");
    case MODAL.SCHEMA_IMPORT:
      return i18n.t("import");
    default:
      return i18n.t("confirm");
  }
};
