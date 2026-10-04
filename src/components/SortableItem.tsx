import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Tag } from "antd";
import type { RundownItem } from "../types";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { openDrawer } from "../store/scriptsSlice";

export function SortableItem({ item, cumulative, onStatus, onSkip, onDuration }: { item: RundownItem; cumulative: string; onStatus: () => void; onSkip: () => void; onDuration: (delta: number) => void }) {
  const dispatch = useAppDispatch();
  const script = useAppSelector((s) => s.scripts.scripts[item.id]);
  const suspended = useAppSelector((s) => s.scripts.suspended.some((su) => su.itemId === item.id));
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id, disabled: item.status === "已播出" });
  const scriptColor = !script ? "default" : script.status === "已下发" ? "green" : script.status === "已确认" ? "blue" : script.status === "待确认" ? "orange" : "default";
  return (
    <article ref={setNodeRef} className={`rundown-row status-${item.status}`} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <button className="drag-handle" {...attributes} {...listeners}>⠿</button>
      <time>{cumulative}</time>
      <div className="row-main">
        <b>{item.title}</b>
        <small>{item.source} · {item.presenter}{script ? <> · 稿件 <Tag color={scriptColor}>{script.status} v{script.currentVersion}</Tag>{suspended && <Tag color="red">挂起</Tag>}</> : null}</small>
      </div>
      <Tag color={item.type === "广告" ? "gold" : item.type === "连线" ? "blue" : "geekblue"}>{item.type}</Tag>
      <span>{item.duration} 分钟</span>
      <Tag color={item.status === "已播出" ? "green" : item.status === "已跳过" ? "red" : "default"}>{item.status}</Tag>
      <div className="row-actions">
        <Button size="small" onClick={() => onDuration(-1)}>-1</Button>
        <Button size="small" onClick={() => onDuration(1)}>+1</Button>
        <Button size="small" onClick={() => dispatch(openDrawer(item.id))}>稿件</Button>
        <Button size="small" type="primary" disabled={item.status === "已播出"} onClick={onStatus}>播出</Button>
        <Button size="small" danger disabled={item.status === "已播出"} onClick={onSkip}>取消</Button>
      </div>
    </article>
  );
}
