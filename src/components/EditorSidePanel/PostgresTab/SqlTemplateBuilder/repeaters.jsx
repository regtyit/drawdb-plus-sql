import {
  AutoComplete,
  Button,
  Checkbox,
  Input,
  Select,
  Tooltip,
} from "@douyinfe/semi-ui";
import { IconDelete, IconPlus } from "@douyinfe/semi-icons";

const COLUMN_TYPE_OPTIONS = [
  "SERIAL",
  "BIGSERIAL",
  "INTEGER",
  "BIGINT",
  "NUMERIC",
  "BOOLEAN",
  "TEXT",
  "VARCHAR",
  "UUID",
  "TIMESTAMP",
  "TIMESTAMPTZ",
  "DATE",
  "JSONB",
];

export { COLUMN_TYPE_OPTIONS };

const OPERATORS = [
  "=",
  "<>",
  ">",
  "<",
  ">=",
  "<=",
  "LIKE",
  "ILIKE",
  "IN",
  "NOT IN",
  "IS NULL",
  "IS NOT NULL",
  "BETWEEN",
];

export function Label({ children }) {
  return (
    <div className="text-[11px] font-medium opacity-70 mb-1">{children}</div>
  );
}

export function Flag({ checked, onChange, label }) {
  return (
    <Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)}>
      <span className="text-[11px]">{label}</span>
    </Checkbox>
  );
}

function RowShell({ index, count, title, children, onRemove, removeLabel }) {
  return (
    <div className="rounded border border-color bg-zinc-50 dark:bg-neutral-900 p-2 flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold opacity-60">
          {title ?? `${index + 1}`}
        </span>
        {count > 1 && (
          <Tooltip content={removeLabel}>
            <Button
              size="small"
              type="danger"
              theme="borderless"
              icon={<IconDelete size="small" />}
              onClick={onRemove}
            />
          </Tooltip>
        )}
      </div>
      {children}
    </div>
  );
}

function AddButton({ onClick, label }) {
  return (
    <Button size="small" icon={<IconPlus />} onClick={onClick}>
      {label}
    </Button>
  );
}

/** Column list builder, e.g. for CREATE TABLE or ALTER TABLE ADD COLUMN. */
export function ColumnsEditor({ value, onChange, t }) {
  const rows = value ?? [];
  const update = (index, patch) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const remove = (index) => onChange(rows.filter((_, i) => i !== index));
  const add = () =>
    onChange([
      ...rows,
      {
        name: "",
        type: "TEXT",
        primary: false,
        notNull: false,
        unique: false,
        default: "",
      },
    ]);

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <RowShell
          key={index}
          index={index}
          count={rows.length}
          title={row.name || `Column ${index + 1}`}
          onRemove={() => remove(index)}
          removeLabel={t("delete")}
        >
          <div className="flex gap-1">
            <Input
              size="small"
              placeholder={t("sql_field_column")}
              value={row.name}
              onChange={(v) => update(index, { name: v })}
            />
            <AutoComplete
              size="small"
              placeholder="TYPE"
              value={row.type}
              data={COLUMN_TYPE_OPTIONS}
              onChange={(v) => update(index, { type: v })}
              style={{ width: 130 }}
            />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <Flag
              checked={row.primary}
              onChange={(v) => update(index, { primary: v })}
              label="PK"
            />
            <Flag
              checked={row.notNull}
              onChange={(v) => update(index, { notNull: v })}
              label="NOT NULL"
            />
            <Flag
              checked={row.unique}
              onChange={(v) => update(index, { unique: v })}
              label="UNIQUE"
            />
            <Flag
              checked={row.ifNotExists}
              onChange={(v) => update(index, { ifNotExists: v })}
              label="IF NOT EXISTS"
            />
          </div>
          <div className="flex gap-1">
            <Input
              size="small"
              placeholder="(size) e.g. 255"
              value={row.args ?? ""}
              onChange={(v) => update(index, { args: v })}
              style={{ width: 90 }}
            />
            <Input
              size="small"
              placeholder="DEFAULT"
              value={row.default ?? ""}
              onChange={(v) => update(index, { default: v })}
            />
          </div>
        </RowShell>
      ))}
      <AddButton onClick={add} label={t("sql_field_add_column")} />
    </div>
  );
}

/** column = value pairs, e.g. for INSERT VALUES / UPDATE SET. */
export function AssignmentsEditor({ value, onChange, t, columnData }) {
  const rows = value ?? [];
  const update = (index, patch) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const remove = (index) => onChange(rows.filter((_, i) => i !== index));
  const add = () => onChange([...rows, { column: "", value: "" }]);

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <RowShell
          key={index}
          index={index}
          count={rows.length}
          onRemove={() => remove(index)}
          removeLabel={t("delete")}
        >
          <div className="flex gap-1">
            <NameInput
              value={row.column}
              onChange={(v) => update(index, { column: v })}
              data={columnData}
              placeholder={t("sql_field_column")}
            />
            <Input
              size="small"
              placeholder={t("value")}
              value={row.value}
              onChange={(v) => update(index, { value: v })}
            />
          </div>
        </RowShell>
      ))}
      <AddButton onClick={add} label={t("sql_field_add_value")} />
    </div>
  );
}

/** WHERE condition rows. */
export function ConditionsEditor({ value, onChange, t, columnData }) {
  const rows = value ?? [];
  const update = (index, patch) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const remove = (index) => onChange(rows.filter((_, i) => i !== index));
  const add = () =>
    onChange([...rows, { column: "", operator: "=", value: "" }]);

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => {
        const noValue =
          row.operator === "IS NULL" || row.operator === "IS NOT NULL";
        return (
          <RowShell
            key={index}
            index={index}
            count={rows.length}
            onRemove={() => remove(index)}
            removeLabel={t("delete")}
          >
            <div className="flex gap-1">
              <NameInput
                value={row.column}
                onChange={(v) => update(index, { column: v })}
                data={columnData}
                placeholder={t("sql_field_column")}
              />
              <Select
                size="small"
                value={row.operator}
                onChange={(v) => update(index, { operator: v })}
                style={{ width: 110 }}
                optionList={OPERATORS.map((op) => ({ value: op, label: op }))}
              />
            </div>
            {!noValue && (
              <Input
                size="small"
                placeholder={t("value")}
                value={row.value ?? ""}
                onChange={(v) => update(index, { value: v })}
              />
            )}
          </RowShell>
        );
      })}
      <AddButton onClick={add} label={t("sql_field_add_condition")} />
    </div>
  );
}

/** ORDER BY rows. */
export function OrderEditor({ value, onChange, t, columnData }) {
  const rows = value ?? [];
  const update = (index, patch) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const remove = (index) => onChange(rows.filter((_, i) => i !== index));
  const add = () => onChange([...rows, { column: "", direction: "ASC" }]);

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <RowShell
          key={index}
          index={index}
          count={rows.length}
          onRemove={() => remove(index)}
          removeLabel={t("delete")}
        >
          <div className="flex gap-1">
            <NameInput
              value={row.column}
              onChange={(v) => update(index, { column: v })}
              data={columnData}
              placeholder={t("sql_field_column")}
            />
            <Select
              size="small"
              value={row.direction}
              onChange={(v) => update(index, { direction: v })}
              style={{ width: 90 }}
              optionList={[
                { value: "ASC", label: "ASC" },
                { value: "DESC", label: "DESC" },
              ]}
            />
          </div>
        </RowShell>
      ))}
      <AddButton onClick={add} label={t("sql_field_add_order")} />
    </div>
  );
}

/** Simple string list, e.g. index columns. */
export function ListEditor({ value, onChange, t, columnData }) {
  const rows = value ?? [];
  const update = (index, v) =>
    onChange(rows.map((row, i) => (i === index ? v : row)));
  const remove = (index) => onChange(rows.filter((_, i) => i !== index));
  const add = () => onChange([...rows, ""]);

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <div key={index} className="flex gap-1 items-center">
          <NameInput
            value={row}
            onChange={(v) => update(index, v)}
            data={columnData}
            placeholder={t("sql_field_column")}
          />
          <Button
            size="small"
            type="danger"
            theme="borderless"
            icon={<IconDelete size="small" />}
            onClick={() => remove(index)}
          />
        </div>
      ))}
      <AddButton onClick={add} label={t("sql_field_add_column")} />
    </div>
  );
}

function NameInput({ value, onChange, data, placeholder }) {
  if (data && data.length > 0) {
    return (
      <AutoComplete
        size="small"
        value={value ?? ""}
        data={data}
        placeholder={placeholder}
        onChange={(v) => onChange(v)}
      />
    );
  }
  return (
    <Input
      size="small"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(v) => onChange(v)}
    />
  );
}
