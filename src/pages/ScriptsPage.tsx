import { useMemo } from "react";
import { Button, Card, Empty, Tag } from "antd";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { confirmScript, distributeScript, openDrawer } from "../store/scriptsSlice";
import type { ScriptStatus } from "../types";
import { ScriptDrawer } from "../components/ScriptDrawer";

const statusColor: Record<ScriptStatus, string> = { 草稿: "default", 待确认: "orange", 已确认: "blue", 已下发: "green" };

export function ScriptsPage() {
  const dispatch = useAppDispatch();
  const scripts = useAppSelector((s) => s.scripts.scripts);
  const items = useAppSelector((s) => s.rundown.items);
  const distributions = useAppSelector((s) => s.scripts.distributions);
  const teleprompter = useAppSelector((s) => s.scripts.teleprompter);
  const suspended = useAppSelector((s) => s.scripts.suspended);
  const role = useAppSelector((s) => s.rundown.role);
  const online = useAppSelector((s) => s.rundown.online);

  const rows = useMemo(() => Object.values(scripts).map((script) => {
    const item = items.find((it) => it.id === script.itemId);
    const pending = distributions.find((d) => d.itemId === script.itemId && d.status !== "已发");
    return { script, item, pending, cached: teleprompter[script.itemId] ?? null, suspended: suspended.some((su) => su.itemId === script.itemId) };
  }).filter((row) => row.item), [scripts, items, distributions, teleprompter, suspended]);

  const canOperate = role === "导播";

  return <Card title="稿件版本与下发" extra={<span className="muted">每条口播、新闻片绑定一份稿件 · 改稿后旧版本作废 · 未播条目重新确认才下发</span>}>
    {!rows.length && <Empty description="还没有口播/新闻片条目" />}
    <div className="script-list">
      {rows.map(({ script, item, pending, cached, suspended: isSuspended }) => (
        <article key={script.itemId} className={`script-row${isSuspended ? " script-row-suspended" : ""}`}>
          <div className="script-row-main">
            <b>{item!.title}</b>
            <small>{item!.type} · {item!.presenter} · 条目状态 {item!.status}</small>
            <div className="script-tags">
              <Tag color={statusColor[script.status]}>稿件{script.status}</Tag>
              <Tag>当前 v{script.currentVersion}</Tag>
              {script.confirmedVersion !== null && <Tag color="blue">已确认 v{script.confirmedVersion}</Tag>}
              {script.distributedVersion !== null && <Tag color="cyan">已下发 v{script.distributedVersion}</Tag>}
              {cached !== null && <Tag color="purple">提词器缓存 v{cached}</Tag>}
              {pending && <Tag color="orange">待发 v{pending.version}（第 {pending.attempts} 次）</Tag>}
              {isSuspended && <Tag color="red">挂起</Tag>}
            </div>
          </div>
          <div className="script-row-actions">
            <Button size="small" onClick={() => dispatch(openDrawer(script.itemId))}>查看稿件</Button>
            <Button size="small" disabled={!canOperate || script.confirmedVersion === script.currentVersion || isSuspended} onClick={() => dispatch(confirmScript({ itemId: script.itemId, role }))}>确认</Button>
            <Button size="small" type="primary" disabled={!canOperate || script.confirmedVersion !== script.currentVersion || isSuspended} onClick={() => dispatch(distributeScript({ itemId: script.itemId, role, online }))}>下发</Button>
          </div>
        </article>
      ))}
    </div>
    <ScriptDrawer />
  </Card>;
}
