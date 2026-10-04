import { useState } from "react";
import { Button, Card, Empty, Input, Modal, Switch, Tag, Timeline, message } from "antd";
import { format } from "date-fns";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { SCRIPT_ACL, confirmScript, dispatchScript, editScript, reconcile, resolveSuspension, retryDispatch, setTeleprompterOnline, type GuardedAction } from "../store/scriptSlice";
import type { Role } from "../types";

const statusColor: Record<string, string> = { 待确认: "orange", 已确认: "geekblue", 已下发: "green", 已作废: "red", 待发: "gold", 已送达: "green", 已取代: "default" };

export function ScriptsPage() {
  const dispatch = useAppDispatch();
  const role = useAppSelector((state) => state.rundown.role);
  const items = useAppSelector((state) => state.rundown.items);
  const scripts = useAppSelector((state) => state.scripts);
  const [editing, setEditing] = useState<{ itemId: string; title: string; body: string } | null>(null);

  const scriptItems = items.filter((item) => item.type === "口播" || item.type === "新闻片");
  const latestOf = (itemId: string) => scripts.versions.filter((v) => v.itemId === itemId).sort((a, b) => b.version - a.version)[0];
  const pending = scripts.dispatchRecords.filter((record) => record.status === "待发");
  const openSuspensions = scripts.suspensions.filter((s) => !s.resolved);
  const rejectedCount = scripts.audit.filter((entry) => entry.rejected).length;
  const reconcileItems = scriptItems.map((item) => ({ id: item.id, title: item.title, status: item.status, type: item.type }));

  /** 统一入口：越权时提示，动作照常下发给 slice，由 slice 拒绝并记审计 */
  const run = (action: GuardedAction, exec: () => void) => {
    if (!SCRIPT_ACL[action].includes(role as Role)) message.error(`越权操作已拒绝：「${role}」岗位无权执行「${action}」`);
    exec();
  };

  const toggleLink = (online: boolean) => {
    dispatch(setTeleprompterOnline(online));
    if (online) {
      dispatch(retryDispatch({ role, auto: true }));
      dispatch(reconcile({ role, items: reconcileItems, auto: true }));
      message.success("提词器链路恢复：已重试未送达稿件，并按条目编号 + 稿件版本完成对账");
    } else {
      message.warning("提词器断网：主播继续念缓存稿件，新下发将进入待发队列");
    }
  };

  const redispatchLatest = (suspensionId: string, itemId: string) => {
    const item = items.find((entry) => entry.id === itemId);
    const latest = latestOf(itemId);
    if (!item || !latest) return;
    run("对账挂起", () => {
      dispatch(resolveSuspension({ role, id: suspensionId, note: "以最新版重新下发" }));
      if (latest.status === "待确认") dispatch(confirmScript({ role, itemId, itemStatus: item.status }));
      if (latest.status === "待确认" || latest.status === "已确认") dispatch(dispatchScript({ role, itemId, itemStatus: item.status }));
    });
  };

  return <div className="page-grid">
    <Card className="main-card">
      <div className="card-heading">
        <div><small>每条口播、新闻片各绑定一份稿件版本 · 改稿即作废旧版</small><h2>稿件版本与播出核对</h2></div>
        <Tag color={scripts.teleprompterOnline ? "green" : "red"}>{scripts.teleprompterOnline ? "提词器在线" : "提词器断网 · 主播念缓存稿"}</Tag>
      </div>
      <div className="summary">
        <span><b>{scriptItems.length}</b> 绑定条目</span>
        <span><b>{scripts.versions.filter((v) => v.status === "待确认").length}</b> 待确认版本</span>
        <span className={pending.length ? "danger-text" : ""}><b>{pending.length}</b> 待发稿件</span>
        <span className={openSuspensions.length ? "danger-text" : ""}><b>{openSuspensions.length}</b> 对账挂起</span>
      </div>
      <p className="perm-note">确认与下发仅「导播」可执行，改稿仅「主编」可执行，「字幕」「演播室」岗位只读；越权操作会被直接拒绝并记入审计（已拦截 {rejectedCount} 次）。</p>
      <div className="script-list">
        {scriptItems.map((item) => {
          const versions = scripts.versions.filter((v) => v.itemId === item.id).sort((a, b) => b.version - a.version);
          const latest = versions[0];
          const cached = scripts.cache.find((entry) => entry.itemId === item.id);
          const suspended = openSuspensions.some((s) => s.itemId === item.id);
          return <article key={item.id} className={`script-card${suspended ? " is-suspended" : ""}`}>
            <div className="script-head">
              <div><b>{item.title}</b><small>{item.type} · {item.presenter} · {item.status}</small></div>
              <div className="script-tags">
                {latest ? <Tag color={statusColor[latest.status]}>稿件 v{latest.version} · {latest.status}</Tag> : <Tag>未绑定稿件</Tag>}
                {cached && <Tag color={latest && cached.version === latest.version ? "green" : "volcano"}>提词器缓存 v{cached.version}</Tag>}
                {suspended && <Tag color="red">对账挂起</Tag>}
              </div>
            </div>
            {latest && <p className="script-body">{latest.body || "（正文为空，待主编补充）"}</p>}
            <div className="version-line">{versions.map((v) => <Tag key={v.id} color={statusColor[v.status]}>v{v.version} {v.status}</Tag>)}</div>
            <div className="script-actions">
              <Button size="small" onClick={() => setEditing({ itemId: item.id, title: latest?.title ?? item.title, body: latest?.body ?? "" })}>编辑稿件（主编）</Button>
              <Button size="small" type="primary" ghost onClick={() => run("确认稿件", () => dispatch(confirmScript({ role, itemId: item.id, itemStatus: item.status })))}>确认（导播）</Button>
              <Button size="small" type="primary" onClick={() => run("下发提词器", () => dispatch(dispatchScript({ role, itemId: item.id, itemStatus: item.status })))}>下发到提词器（导播）</Button>
            </div>
          </article>;
        })}
        {!scriptItems.length && <Empty description="串联单中还没有口播或新闻片条目" />}
      </div>
    </Card>

    <aside className="side-stack">
      <Card title="提词器链路" extra={<Tag color={scripts.teleprompterOnline ? "green" : "red"}>{scripts.teleprompterOnline ? "在线" : "断网"}</Tag>}>
        <label className="link-switch"><Switch checked={scripts.teleprompterOnline} onChange={toggleLink} /> 提词器网络</label>
        <small>断网时主播继续念缓存稿件；恢复后自动重试未送达部分，并按条目编号 + 稿件版本对账。</small>
        <div className="cache-list">
          {scripts.cache.map((entry) => {
            const item = items.find((i) => i.id === entry.itemId);
            const latest = latestOf(entry.itemId);
            const stale = latest && entry.version !== latest.version;
            return <article key={entry.itemId}><b>{item?.title ?? entry.itemId}</b><Tag color={stale ? "volcano" : "green"}>缓存 v{entry.version}{stale ? " · 旧版" : ""}</Tag></article>;
          })}
          {!scripts.cache.length && <p>提词器暂无缓存稿件。</p>}
        </div>
        <Button block onClick={() => run("对账挂起", () => dispatch(reconcile({ role, items: reconcileItems })))}>手动对账（导播）</Button>
      </Card>

      <Card title="待发队列" extra={<Button size="small" type="primary" disabled={!pending.length} onClick={() => run("重试下发", () => dispatch(retryDispatch({ role })))}>重试未送达</Button>}>
        <div className="queue-list">
          {pending.map((record) => {
            const item = items.find((i) => i.id === record.itemId);
            return <article key={record.id}><Tag color="gold">待发</Tag><b>{item?.title ?? record.itemId} · v{record.version}</b><small>已试 {record.attempts} 次</small></article>;
          })}
          {!pending.length && <p>待发队列为空。已送达 {scripts.dispatchRecords.filter((r) => r.status === "已送达").length} 条，已取代 {scripts.dispatchRecords.filter((r) => r.status === "已取代").length} 条。</p>}
        </div>
      </Card>

      <Card title="对账挂起">
        {openSuspensions.map((s) => {
          const item = items.find((i) => i.id === s.itemId);
          return <article key={s.id} className="suspension">
            <b>{item?.title ?? s.itemId}</b>
            <ul className="diff-list">{s.diffs.map((diff, index) => <li key={index}>{diff}</li>)}</ul>
            <div className="script-actions">
              <Button size="small" type="primary" onClick={() => redispatchLatest(s.id, s.itemId)}>确认并重新下发最新版</Button>
              <Button size="small" onClick={() => run("对账挂起", () => dispatch(resolveSuspension({ role, id: s.id, note: "维持缓存稿件，人工关闭" })))}>维持缓存并关闭</Button>
            </div>
          </article>;
        })}
        {!openSuspensions.length && <p className="muted-text">当前没有挂起条目。</p>}
      </Card>

      <Card title="播出日志">
        <Timeline items={scripts.broadcastLog.map((entry) => ({
          color: entry.via === "断网缓存" ? "orange" : "green",
          children: <div><b>{entry.title}</b><p>实际播出 v{entry.versionRead} · {entry.via}</p><small>{format(new Date(entry.airedAt), "HH:mm:ss")}</small></div>
        }))} />
      </Card>

      <Card title="稿件操作审计">
        <Timeline items={scripts.audit.slice(0, 20).map((entry) => ({
          color: entry.rejected ? "red" : "blue",
          children: <div><b>{entry.action} · {entry.role}</b><p>{entry.detail}</p><small>{format(new Date(entry.time), "HH:mm:ss")}</small></div>
        }))} />
        {!scripts.audit.length && <p className="muted-text">暂无稿件操作记录。</p>}
      </Card>
    </aside>

    <Modal open={!!editing} title="编辑稿件（保存即生成新版本，已下发旧版作废）" okText="保存新版本" onCancel={() => setEditing(null)} onOk={() => {
      if (editing) run("编辑稿件", () => dispatch(editScript({ role, itemId: editing.itemId, title: editing.title, body: editing.body })));
      setEditing(null);
    }}>
      <Input value={editing?.title} onChange={(event) => setEditing((cur) => cur && { ...cur, title: event.target.value })} placeholder="稿件标题" style={{ marginBottom: 10 }} />
      <Input.TextArea rows={6} value={editing?.body} onChange={(event) => setEditing((cur) => cur && { ...cur, body: event.target.value })} placeholder="口播正文" />
    </Modal>
  </div>;
}
