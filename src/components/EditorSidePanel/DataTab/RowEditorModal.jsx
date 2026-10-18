import { useEffect, useMemo, useState } from "react";
import { Button, Modal, TextArea } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";

function isEditable(column) {
  if (column.generated) return false;
  if (column.identity === "a") return false;
  return true;
}

function toInputValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function RowEditorModal({
  visible,
  mode,
  columns,
  initialValues,
  primaryKey,
  submitting,
  onCancel,
  onSubmit,
}) {
  const { t } = useTranslation();
  const editableColumns = useMemo(() => {
    const pkColumns = new Set(primaryKey ?? []);
    return columns.filter(
      (c) => isEditable(c) && (mode === "insert" || !pkColumns.has(c.name)),
    );
  }, [columns, primaryKey, mode]);

  const [values, setValues] = useState({});

  useEffect(() => {
    if (!visible) return;
    const next = {};
    for (const column of editableColumns) {
      next[column.name] = toInputValue(initialValues?.[column.name]);
    }
    setValues(next);
  }, [visible, editableColumns, initialValues]);

  const handleSubmit = () => {
    const payload = {};
    for (const column of editableColumns) {
      const raw = values[column.name];
      payload[column.name] = raw === "" ? null : raw;
    }
    onSubmit(payload);
  };

  return (
    <Modal
      title={mode === "insert" ? t("add_row") : t("edit_row")}
      visible={visible}
      onCancel={onCancel}
      footer={null}
      width={520}
    >
      <div className="flex flex-col gap-3 max-h-[60vh] overflow-auto">
        {editableColumns.map((column) => (
          <div key={column.name} className="flex flex-col gap-1">
            <label className="text-xs font-medium flex items-center gap-2">
              <span>{column.name}</span>
              <span className="opacity-50 font-mono">{column.dataType}</span>
              {column.notNull && <span className="text-red-500">*</span>}
            </label>
            <TextArea
              autosize={{ minRows: 1, maxRows: 4 }}
              value={values[column.name] ?? ""}
              onChange={(value) =>
                setValues((prev) => ({ ...prev, [column.name]: value }))
              }
              placeholder="NULL"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button theme="borderless" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button theme="solid" loading={submitting} onClick={handleSubmit}>
          {mode === "insert" ? t("add_row") : t("save")}
        </Button>
      </div>
    </Modal>
  );
}
