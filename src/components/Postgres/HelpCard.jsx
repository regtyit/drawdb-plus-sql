import { Button } from "@douyinfe/semi-ui";
import { IconLink, IconCode } from "@douyinfe/semi-icons";
import { IconTable } from "../../icons";
import { useTranslation } from "react-i18next";
import { usePostgres, useSelect, useModal } from "../../hooks";
import { MODAL, Tab } from "../../data/constants";

function Step({ index, children }) {
  return (
    <div className="pg-step text-xs">
      <span className="pg-step-index">{index}</span>
      <span className="leading-5">{children}</span>
    </div>
  );
}

export default function PostgresHelpCard() {
  const { t } = useTranslation();
  const { connected, connection, openConnectionModal } = usePostgres();
  const { setSelectedElement } = useSelect();
  const { setModal } = useModal();

  const goToTab = (tab) =>
    setSelectedElement((prev) => ({ ...prev, currentTab: tab }));

  return (
    <div className="pg-highlight p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm">{t("pg_help_title")}</span>
        <span className="pg-badge">NEW</span>
      </div>

      {connected ? (
        <div className="text-xs opacity-80">
          {t("pg_connected_to", {
            database: connection.database,
            schema: connection.schema || "public",
          })}
        </div>
      ) : (
        <Step index="1">{t("pg_help_step_connect")}</Step>
      )}
      <Step index={connected ? "1" : "2"}>{t("pg_help_step_schema")}</Step>
      <Step index={connected ? "2" : "3"}>{t("pg_help_step_data")}</Step>

      <div className="flex flex-wrap gap-2 mt-1">
        {!connected && (
          <Button
            size="small"
            theme="solid"
            icon={<IconLink />}
            onClick={openConnectionModal}
          >
            {t("connect")}
          </Button>
        )}
        {connected && (
          <>
            <Button
              size="small"
              theme="solid"
              icon={<i className="fa-solid fa-cloud-arrow-up" />}
              onClick={() => setModal(MODAL.SCHEMA_SYNC)}
            >
              {t("apply_schema_to_postgres")}
            </Button>
            <Button
              size="small"
              icon={<i className="fa-solid fa-cloud-arrow-down" />}
              onClick={() => setModal(MODAL.SCHEMA_IMPORT)}
            >
              {t("import_schema_from_postgres")}
            </Button>
            <Button
              size="small"
              icon={<i className="fa-solid fa-arrows-rotate" />}
              onClick={() => setModal(MODAL.SCHEMA_MIGRATION)}
            >
              {t("update_schema_from_postgres")}
            </Button>
            <Button
              size="small"
              icon={<IconTable />}
              onClick={() => goToTab(Tab.DATA)}
            >
              {t("data_browser")}
            </Button>
            <Button
              size="small"
              icon={<IconCode />}
              onClick={() => goToTab(Tab.SQL_CONSOLE)}
            >
              {t("sql_console")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
