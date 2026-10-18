import { useEffect, useState } from "react";
import { Button, Checkbox, Input, Switch, Toast } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { usePostgres } from "../../../hooks";
import { MODAL } from "../../../data/constants";

export function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium opacity-80">{label}</label>
      {children}
    </div>
  );
}

export default function PostgresConnection({ setModal }) {
  const { t } = useTranslation();
  const {
    connection,
    updateConnection,
    remember,
    setRemember,
    connecting,
    connect,
    test,
  } = usePostgres();

  const [form, setForm] = useState(connection);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setForm(connection);
  }, [connection]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const onTest = async () => {
    setTesting(true);
    setError(null);
    setTestResult(null);
    try {
      const info = await test(form);
      setTestResult(info);
      Toast.success(t("connection_successful"));
    } catch (e) {
      setError(e);
    } finally {
      setTesting(false);
    }
  };

  const onConnect = async () => {
    setError(null);
    try {
      await connect(form);
      updateConnection(form);
      Toast.success(t("connection_successful"));
      setModal(MODAL.NONE);
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="flex flex-col gap-3" style={{ direction: "ltr" }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("host")}>
          <Input value={form.host} onChange={(v) => set("host", v)} />
        </Field>
        <Field label={t("port")}>
          <Input
            value={String(form.port ?? "")}
            onChange={(v) => set("port", v)}
          />
        </Field>
        <Field label={t("user")}>
          <Input value={form.user} onChange={(v) => set("user", v)} />
        </Field>
        <Field label={t("password")}>
          <Input
            mode="password"
            value={form.password}
            onChange={(v) => set("password", v)}
          />
        </Field>
        <Field label={t("database_name")}>
          <Input value={form.database} onChange={(v) => set("database", v)} />
        </Field>
        <Field label={t("target_schema")}>
          <Input value={form.schema} onChange={(v) => set("schema", v)} />
        </Field>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch checked={form.ssl} onChange={(v) => set("ssl", v)} />
          <span className="text-xs">{t("ssl")}</span>
        </div>
        <Checkbox
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
        >
          <span className="text-xs">{t("remember_password")}</span>
        </Checkbox>
      </div>

      {testResult && (
        <div className="text-xs rounded border border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-900 p-2">
          <div className="font-mono break-all">{testResult.version}</div>
          <div className="opacity-70">
            {testResult.database} · {testResult.username}
          </div>
        </div>
      )}

      {error && (
        <div className="text-xs rounded border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-900 p-2">
          {error.message}
          {error.detail && <div className="opacity-80">{error.detail}</div>}
        </div>
      )}

      <div className="flex justify-end gap-2 mt-1">
        <Button theme="borderless" onClick={() => setModal(MODAL.NONE)}>
          {t("cancel")}
        </Button>
        <Button loading={testing} onClick={onTest}>
          {testing ? t("testing") : t("test_connection")}
        </Button>
        <Button theme="solid" loading={connecting} onClick={onConnect}>
          {t("connect")}
        </Button>
      </div>
    </div>
  );
}
