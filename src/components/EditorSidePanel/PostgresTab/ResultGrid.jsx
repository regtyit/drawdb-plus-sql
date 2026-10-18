import { useMemo } from "react";
import { Table } from "@douyinfe/semi-ui";

function formatCell(value) {
  if (value === null || value === undefined) {
    return <span className="opacity-50 italic">NULL</span>;
  }
  if (typeof value === "boolean") return String(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function ResultGrid({
  fields = [],
  rows = [],
  maxHeight,
  actions,
}) {
  const columns = useMemo(() => {
    const base = fields.map((field) => ({
      title: field.name,
      dataIndex: field.name,
      width: 150,
      render: (text) => (
        <span className="whitespace-nowrap">{formatCell(text)}</span>
      ),
    }));
    if (actions) {
      base.unshift({
        title: actions.header ?? "",
        dataIndex: "__actions",
        width: actions.width ?? 110,
        fixed: "left",
        render: (_text, row) => actions.render(row),
      });
    }
    return base;
  }, [fields, actions]);

  const dataSource = useMemo(
    () => rows.map((row, index) => ({ ...row, __rowid: index })),
    [rows],
  );

  return (
    <Table
      columns={columns}
      dataSource={dataSource}
      rowKey="__rowid"
      pagination={false}
      size="small"
      scroll={{ x: "max-content", y: maxHeight }}
      empty={<div className="text-center text-xs opacity-60 py-4">No rows</div>}
    />
  );
}
