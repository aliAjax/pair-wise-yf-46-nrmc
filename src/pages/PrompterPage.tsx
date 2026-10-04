import { useMemo } from "react";
import { Alert, Button, Card, Empty, Table, Tag } from "antd";
import { format } from "date-fns";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { reconcile, retryDistribution } from "../store/scriptsSlice";
import { DiffView } from "../components/DiffView";
import type { DistributionRecord } from "../types";

export function PrompterPage() {
  const dispatch = useAppDispatch();
  const scripts = useAppSelector((s) => s.scripts.scripts);
  const teleprompter = useAppSelector((s) => s.scripts.teleprompter);
  const distributions = useAppSelector((s) => s.scripts.distributions);
  const suspended = useAppSelector((s) => s.scripts.suspended);
  const broadcastLog = useAppSelector((s) => s.scripts.broadcastLog);
  const items = useAppSelector((s) => s.rundown.items);
  const role = useAppSelector((s) => s.rundown.role);
  const online = useAppSelector((s) => s.rundown.online);

  const cachedRows = useMemo(() => Object.values(scripts).map((script) => {
    const item = items.find((it) => it.id === script.itemId);
    const cachedVersion = teleprompter[script.itemId] ?? null;
    const cached = cachedVersion === null ? null : script.versions.find((v) => v.version === cachedVersion) ?? null;
    const current = script.versions.find((v) => v.version === script.currentVersion);
    return { script, item, cachedVersion, cached, currentVersion: script.currentVersion, mismatched: cachedVersion !== null && cachedVersion !== script.currentVersion };
  }).filter((row) => row.item), [scripts, teleprompter, items]);

  const pending = distributions.filter((d) => d.status !== "已发");
  const canOperate = role === "导播";

  return <div className="prompter-grid">
    {!online && (
      <Alert
        type="error"
        showIcon
        className="offline-banner"
        message="提词器断网应急模式"
        description="主播正在念提词器缓存稿件（最近一次成功下发的版本）。网络恢复后将自动按条目编号与稿件版本对账，不一致的条目挂起并列出差异。"
      />
    )}

    <Card
      title="提词器（主播看到的内容）"
      className="prompter-card"
      extra={<Tag color={online ? "green" : "red"}>{online ? "链路正常" : "断网 · 缓存播出"}</Tag>}
    >
      {!cachedRows.length && <Empty description="提词器还没有缓存稿件" />}
      <div className="prompter-list">
        {cachedRows.map(({ script, item, cachedVersion, cached, currentVersion, mismatched }) => (
          <article key={script.itemId} className={`prompter-row${mismatched ? " prompter-row-mismatch" : ""}`}>
            <div className="prompter-row-head">
              <b>{item!.title}</b>
              {cachedVersion === null
                ? <Tag>未下发</Tag>
                : <Tag color={mismatched ? "red" : "green"}>缓存 v{cachedVersion}{mismatched ? ` · 服务器 v${currentVersion}` : ""}</Tag>}
            </div>
            <div className="prompter-screen">{cached?.body || <span className="muted">（暂无正文，主播即兴口播）</span>}</div>
            <small className="muted">条目编号 {script.itemId} · {item!.type}{mismatched ? " · 缓存与服务器不一致，已挂起" : ""}</small>
          </article>
        ))}
      </div>
    </Card>

    <Card
      title="待发队列（下发失败/未确认）"
      extra={<Button type="primary" disabled={!canOperate || !online || !pending.length} onClick={() => dispatch(retryDistribution({ role, online }))}>重试未发出的部分</Button>}
    >
      {!pending.length ? <Empty description="待发队列为空" /> : (
        <Table<DistributionRecord>
          size="small"
          rowKey={(d) => d.id}
          pagination={false}
          dataSource={pending}
          columns={[
            { title: "条目", dataIndex: "itemId", render: (id: string) => items.find((it) => it.id === id)?.title ?? id },
            { title: "版本", dataIndex: "version", render: (v: number) => `v${v}` },
            { title: "状态", dataIndex: "status", render: (s: string) => <Tag color={s === "失败" ? "red" : "orange"}>{s}</Tag> },
            { title: "尝试次数", dataIndex: "attempts" },
            { title: "原因", dataIndex: "lastError", render: (e: string | null) => <span className="muted">{e ?? "—"}</span> }
          ]}
        />
      )}
    </Card>

    <Card
      title="对账与挂起"
      extra={<Button disabled={!canOperate} onClick={() => dispatch(reconcile())}>立即对账</Button>}
    >
      {!suspended.length ? <Empty description="没有挂起条目，提词器缓存与服务器版本一致" /> : (
        <div className="suspended-list">
          {suspended.map((s) => (
            <article key={s.itemId} className="suspended-row">
              <div className="suspended-head">
                <b>{s.title}</b>
                <Tag color="red">挂起</Tag>
                <Tag>缓存 v{s.cachedVersion}</Tag>
                <Tag color="orange">服务器 v{s.serverVersion}</Tag>
                <small className="muted">{format(new Date(s.suspendedAt), "HH:mm:ss")}</small>
              </div>
              <p className="muted">{s.reason}（条目编号 {s.itemId}）</p>
              <DiffView lines={s.diff} />
            </article>
          ))}
        </div>
      )}
    </Card>

    <Card title="播出日志（实际念到的版本）">
      {!broadcastLog.length ? <Empty description="还没有已播出条目" /> : (
        <Table
          size="small"
          rowKey={(l) => l.id}
          pagination={false}
          dataSource={broadcastLog}
          columns={[
            { title: "条目", dataIndex: "title" },
            { title: "实际念到版本", dataIndex: "readVersion", render: (v: number | null) => v === null ? <Tag>无下发记录</Tag> : <Tag color="purple">v{v}</Tag> },
            { title: "服务器版本", dataIndex: "serverVersion", render: (v: number) => `v${v}` },
            {
              title: "对账",
              dataIndex: "matched",
              render: (matched: boolean) => matched ? <Tag color="green">一致</Tag> : <Tag color="red">不一致</Tag>
            },
            { title: "播出时间", dataIndex: "airedAt", render: (t: string) => format(new Date(t), "MM-dd HH:mm:ss") }
          ]}
        />
      )}
    </Card>
  </div>;
}
