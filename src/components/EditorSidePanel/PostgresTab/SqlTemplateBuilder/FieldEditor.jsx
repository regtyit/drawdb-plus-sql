import {
  AutoComplete,
  Input,
  InputNumber,
  Select,
  Switch,
  TextArea,
} from "@douyinfe/semi-ui";
import {
  AssignmentsEditor,
  ConditionsEditor,
  ColumnsEditor,
  ListEditor,
  OrderEditor,
  COLUMN_TYPE_OPTIONS,
} from "./repeaters";

/** Render the editor for one template field. */
export default function FieldEditor({
  field,
  value,
  onChange,
  t,
  tables,
  columnData,
}) {
  switch (field.type) {
    case "table":
      return (
        <AutoComplete
          className="w-full"
          value={value ?? ""}
          data={tables}
          placeholder={field.placeholder}
          onChange={(v) => onChange(v)}
        />
      );
    case "type":
      return (
        <AutoComplete
          className="w-full"
          value={value ?? ""}
          data={COLUMN_TYPE_OPTIONS}
          onChange={(v) => onChange(v)}
        />
      );
    case "textarea":
      return (
        <TextArea
          autosize={{ minRows: 2, maxRows: 8 }}
          value={value ?? ""}
          placeholder={field.placeholder}
          onChange={(v) => onChange(v ?? "")}
        />
      );
    case "number":
      return (
        <InputNumber
          className="w-full"
          value={value === "" || value === undefined ? undefined : value}
          placeholder={field.placeholder}
          onChange={(v) => onChange(v)}
        />
      );
    case "switch":
      return (
        <Switch checked={Boolean(value)} onChange={onChange} size="small" />
      );
    case "select":
      return (
        <Select
          className="w-full"
          value={value}
          onChange={onChange}
          optionList={(field.options ?? []).map((o) => ({
            value: o.value,
            label: o.label,
          }))}
        />
      );
    case "columns":
      return <ColumnsEditor value={value} onChange={onChange} t={t} />;
    case "assignments":
      return (
        <AssignmentsEditor
          value={value}
          onChange={onChange}
          t={t}
          columnData={columnData}
        />
      );
    case "conditions":
      return (
        <ConditionsEditor
          value={value}
          onChange={onChange}
          t={t}
          columnData={columnData}
        />
      );
    case "order":
      return (
        <OrderEditor
          value={value}
          onChange={onChange}
          t={t}
          columnData={columnData}
        />
      );
    case "list":
      return (
        <ListEditor
          value={value}
          onChange={onChange}
          t={t}
          columnData={columnData}
        />
      );
    default:
      return (
        <Input
          value={value ?? ""}
          placeholder={field.placeholder}
          onChange={(v) => onChange(v)}
        />
      );
  }
}
