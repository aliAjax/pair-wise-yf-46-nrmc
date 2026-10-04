import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Drawer, Empty, Form, Input, message, Select, Tag, Timeline } from "antd";
import { format } from "date-fns";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { closeDrawer, confirmScript, distributeScript, editScript } from "../store/scriptsSlice";
import { diffLines, diffTitle } from "../lib/diff";
import { DiffView } from "./DiffView";

const { TextArea } = Input;

function versionTag(state: "有效" | "已作废") {
  return state === "有效" ? <Tag color="green">有效</Tag> : <Tag>已作废</Tag>;
}

export function ScriptDrawer() {
  const dispatch = useAppDispatch();
  const itemId = useAppSelector((s) => s.scripts.drawerItemId);
  const script = useAppSelector((s) => (itemId ? s.scripts.scripts[itemId] : undefined));
  const item = useAppSelector((s) => s.rundown.items.find((it) => it.id === itemId));
  const role = useAppSelector((s) => s.rundown.role);
  const online = useAppSelector((s) => s.rundown.online);
  const suspended = useAppSelector((s) => s.scripts.suspended.find((su) => su.itemId === itemId));

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");
  const [fromVersion, setFromVersion] = useState(1);
  const [toVersion, setToVersion] = useState(1);

  useEffect(() => {
    if (script) {
      const latest = script.versions[script.versions.length - 1];
      setTitle(latest.title);
      setBody(latest.body);
      setNote("");
      setFromVersion(Math.max(1, script.currentVersion - 1));
      setToVersion(script.currentVersion);
    }
  }, [script?.itemId, script?.currentVersion]);

  const diff = useMemo(() => {
    if (!script) return null;
    const from = script.versions.find((v) => v.version === fromVersion);
    const to = script.versions.find((v) => v.version === toVersion);
    if (!from || !to) return null;
    return { lines: diffLines(from.body, to.body), title: diffTitle(from.title, to.title) };
  }, [script, fromVersion, toVersion]);

  if (!script || !item) return <Drawer open={false} onClose={() => dispatch(closeDrawer())} />;

  const canEdit = role === "主编";
  const canDistribute = role === "导播";
  const versionOptions = script.versions.map((v) => ({ value: v.version, label: `v${v.version}${v.state === "已作废" ? "（已作废）" : ""}` }));

  return (
    <Drawer
      open={!!itemId}
      onClose={() => dispatch(closeDrawer())}
      width={640}
      title={<span>稿件 · {item.title} <Tag color="geekblue">{item.type}</Tag></span>}
      footer={
        <div className="drawer-footer">
          <Button disabled={!canDistribute || script.confirmedVersion === script.currentVersion || !!suspended} onClick={() => dispatch(confirmScript({ itemId: script.itemId, role }))}>确认当前版本</Button>
          <Button type="primary" disabled={!canDistribute || script.confirmedVersion !== script.currentVersion || !!suspended} onClick={() => dispatch(distributeScript({ itemId: script.itemId, role, online }))}>下发到提词器</Button>
          {!canDistribute && <small className="perm-hint">仅导播可确认/下发，当前岗位「{role}」只读</small>}
        </div>
      }
    >
      {suspended && (
        <Alert
          type="error"
          showIcon
          className="suspended-alert"
          message="该条目处于挂起状态"
          description={
            <div>
              <p>{suspended.reason}：提词器缓存 <b>v{suspended.cachedVersion}</b>，服务器当前 <b>v{suspended.serverVersion}</b>。请主编改稿、导播重新确认并下发，对账一致后自动解除。</p>
            </div>
          }
        />
      )}

      <section className="script-section">
        <h3>版本历史</h3>
        <Timeline
          items={script.versions.map((v) => ({
            color: v.state === "有效" ? "green" : "gray",
            children: (
              <div className="version-card">
                <div className="version-head">
                  <b>v{v.version}</b>
                  {versionTag(v.state)}
                  {v.version === script.confirmedVersion && <Tag color="blue">已确认</Tag>}
                  {v.version === script.distributedVersion && <Tag color="cyan">已下发</Tag>}
                  <small>{v.createdBy} · {format(new Date(v.createdAt), "MM-dd HH:mm")}</small>
                </div>
                <div className="version-title">{v.title}</div>
                <div className="version-body">{v.body || <span className="muted">（正文为空）</span>}</div>
                {v.note && <small className="muted">备注：{v.note}</small>}
              </div>
            )
          }))}
        />
      </section>

      <section className="script-section">
        <h3>版本差异</h3>
        <div className="diff-controls">
          <Select value={fromVersion} onChange={setFromVersion} options={versionOptions} />
          <span>→</span>
          <Select value={toVersion} onChange={setToVersion} options={versionOptions} />
        </div>
        {diff && diff.title.changed && (
          <Alert type="warning" className="diff-title-alert" message={<span>标题：<s>{diff.title.from}</s> → <b>{diff.title.to}</b></span>} />
        )}
        {diff ? <DiffView lines={diff.lines} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
      </section>

      <section className="script-section">
        <h3>主编改稿 <small className="muted">保存后生成新版本，已下发旧版本作废</small></h3>
        <Form layout="vertical">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="稿件标题" disabled={!canEdit} />
          <TextArea value={body} onChange={(e) => setBody(e.target.value)} placeholder="口播/新闻片正文（提词器逐行显示）" autoSize={{ minRows: 5, maxRows: 12 }} disabled={!canEdit} />
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="修订备注（可选）" disabled={!canEdit} />
          <Button
            type="primary"
            disabled={!canEdit || !title.trim()}
            onClick={() => {
              dispatch(editScript({ itemId: script.itemId, title: title.trim(), body, note: note.trim(), role }));
              message.success("已提交修订");
            }}
          >
            保存为新版本
          </Button>
          {!canEdit && <small className="perm-hint">仅主编可修改稿件，当前岗位「{role}」只读</small>}
        </Form>
      </section>
    </Drawer>
  );
}
