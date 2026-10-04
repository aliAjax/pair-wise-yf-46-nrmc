import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { BroadcastLogEntry, DistributionRecord, Role, Script, ScriptVersion, ScriptsPersistState, SuspendedItem } from "../types";
import { diffLines } from "../lib/diff";
import { addItem, initialize, insertBreaking, updateStatus } from "./rundownSlice";

interface ScriptsState extends ScriptsPersistState {
  /** 仅内存态：是否已从 localStorage 加载、抽屉开关、操作提示 */
  loaded: boolean;
  drawerItemId: string | null;
  messages: { id: string; type: "error" | "success" | "info"; text: string; at: string }[];
}

/** 为一条口播/新闻片初始化稿件 v1 */
function seedScript(item: { id: string; title: string; type: string }): Script | null {
  if (item.type !== "口播" && item.type !== "新闻片") return null;
  const v1: ScriptVersion = {
    id: crypto.randomUUID(),
    version: 1,
    title: item.title,
    body: "",
    note: "初始稿件",
    createdBy: "导播",
    createdAt: new Date().toISOString(),
    state: "有效"
  };
  return { id: crypto.randomUUID(), itemId: item.id, versions: [v1], currentVersion: 1, confirmedVersion: null, distributedVersion: null, status: "草稿" };
}

function reject(state: ScriptsState, text: string) {
  state.messages.push({ id: crypto.randomUUID(), type: "error", text, at: new Date().toISOString() });
}

function notify(state: ScriptsState, type: "success" | "info", text: string) {
  state.messages.push({ id: crypto.randomUUID(), type, text, at: new Date().toISOString() });
}

/** 演示用种子：已播出的 r1 新闻片有一条已下发 v1、提词器缓存与播出日志 */
const seedScriptR1: Script = {
  id: "script-r1",
  itemId: "r1",
  versions: [{ id: "sv-r1-v1", version: 1, title: "早间新闻提要", body: "各位观众早上好，欢迎收看早间新闻……", note: "初始稿件", createdBy: "导播", createdAt: "2026-10-08T07:30:00.000Z", state: "有效" }],
  currentVersion: 1,
  confirmedVersion: 1,
  distributedVersion: 1,
  status: "已下发"
};

const initialState: ScriptsState = {
  loaded: false,
  drawerItemId: null,
  scripts: { r1: seedScriptR1 },
  distributions: [{ id: "dist-r1", itemId: "r1", version: 1, status: "已发", attempts: 1, sentAt: "2026-10-08T07:31:00.000Z", lastError: null }],
  teleprompter: { r1: 1 },
  suspended: [],
  broadcastLog: [{ id: "log-r1", itemId: "r1", title: "早间新闻提要", readVersion: 1, serverVersion: 1, matched: true, airedAt: "2026-10-08T07:35:00.000Z" }],
  messages: []
};

const slice = createSlice({
  name: "scripts",
  initialState,
  reducers: {
    initializeScripts(state, action: PayloadAction<ScriptsPersistState | null>) {
      if (state.loaded) return;
      state.loaded = true;
      const data = action.payload;
      // 本地有存档则覆盖种子，没有则保留种子
      if (data && Object.keys(data.scripts).length) {
        state.scripts = data.scripts;
        state.distributions = data.distributions;
        state.teleprompter = data.teleprompter;
        state.suspended = data.suspended;
        state.broadcastLog = data.broadcastLog;
      }
    },
    openDrawer(state, action: PayloadAction<string>) { state.drawerItemId = action.payload; },
    closeDrawer(state) { state.drawerItemId = null; },
    clearMessages(state) { state.messages = []; },

    /** 主编修改标题/正文：生成新版本，旧版本作废，条目回到待确认 */
    editScript(state, action: PayloadAction<{ itemId: string; title: string; body: string; note: string; role: Role }>) {
      const { itemId, title, body, note, role } = action.payload;
      if (role !== "主编") return reject(state, `越权操作：「${role}」无权修改稿件，已拒绝（仅主编可改稿）`);
      const script = state.scripts[itemId];
      if (!script) return;
      const latest = script.versions[script.versions.length - 1];
      if (latest.title === title && latest.body === body) {
        return notify(state, "info", "稿件内容未变化，未生成新版本");
      }
      for (const v of script.versions) v.state = "已作废";
      const next: ScriptVersion = {
        id: crypto.randomUUID(),
        version: script.currentVersion + 1,
        title,
        body,
        note: note || "主编修订",
        createdBy: role,
        createdAt: new Date().toISOString(),
        state: "有效"
      };
      script.versions.push(next);
      script.currentVersion = next.version;
      script.status = "待确认";
      notify(state, "success", `稿件已更新至 v${next.version}，旧版本全部作废，待导播重新确认后下发`);
    },

    /** 导播确认当前版本，确认后才能下发 */
    confirmScript(state, action: PayloadAction<{ itemId: string; role: Role }>) {
      const { itemId, role } = action.payload;
      if (role !== "导播") return reject(state, `越权操作：「${role}」无权确认稿件，已拒绝（仅导播可确认/下发）`);
      const script = state.scripts[itemId];
      if (!script) return;
      if (script.confirmedVersion === script.currentVersion) {
        return notify(state, "info", `v${script.currentVersion} 已确认，无需重复操作`);
      }
      script.confirmedVersion = script.currentVersion;
      script.status = "已确认";
      notify(state, "success", `稿件 v${script.currentVersion} 已确认，可以下发`);
    },

    /** 导播下发当前确认版本到提词器；同条目同版本只记一次；失败留在待发队列 */
    distributeScript(state, action: PayloadAction<{ itemId: string; role: Role; online: boolean }>) {
      const { itemId, role, online } = action.payload;
      if (role !== "导播") return reject(state, `越权操作：「${role}」无权下发稿件，已拒绝（仅导播可确认/下发）`);
      const script = state.scripts[itemId];
      if (!script) return;
      if (script.confirmedVersion !== script.currentVersion) {
        return reject(state, `稿件 v${script.currentVersion} 尚未确认，请先确认再下发`);
      }
      if (state.suspended.some((s) => s.itemId === itemId)) {
        return reject(state, "该条目处于挂起状态，网络恢复对账通过后才能下发");
      }
      const existing = state.distributions.find((d) => d.itemId === itemId && d.version === script.currentVersion);
      if (existing?.status === "已发") {
        return notify(state, "info", `v${script.currentVersion} 已下发过，不重复记录`);
      }
      if (!online) {
        // 同条目旧版本的待发记录已被新版本取代
        for (const old of state.distributions) {
          if (old.itemId === itemId && old.status !== "已发" && old.version !== script.currentVersion) {
            old.status = "失败";
            old.lastError = `已被 v${script.currentVersion} 取代，无需重发`;
          }
        }
        if (existing) {
          existing.status = "待发";
          existing.attempts += 1;
          existing.lastError = "链路中断，下发失败，留在待发队列";
        } else {
          state.distributions.push({
            id: crypto.randomUUID(),
            itemId,
            version: script.currentVersion,
            status: "待发",
            attempts: 1,
            sentAt: null,
            lastError: "链路中断，下发失败，留在待发队列"
          });
        }
        return reject(state, "离线：下发失败，已留在待发队列，主播暂念缓存旧稿");
      }
      if (existing) {
        existing.status = "已发";
        existing.attempts += 1;
        existing.sentAt = new Date().toISOString();
        existing.lastError = null;
      } else {
        state.distributions.push({
          id: crypto.randomUUID(),
          itemId,
          version: script.currentVersion,
          status: "已发",
          attempts: 1,
          sentAt: new Date().toISOString(),
          lastError: null
        });
      }
      state.teleprompter[itemId] = script.currentVersion;
      script.distributedVersion = script.currentVersion;
      script.status = "已下发";
      notify(state, "success", `稿件 v${script.currentVersion} 已下发至提词器`);
    },

    /** 重试待发队列：只发没发出去的，已发的不动 */
    retryDistribution(state, action: PayloadAction<{ role: Role; online: boolean }>) {
      const { role, online } = action.payload;
      if (role !== "导播") return reject(state, `越权操作：「${role}」无权重试下发，已拒绝`);
      const pending = state.distributions.filter((d) => d.status !== "已发");
      if (!pending.length) return notify(state, "info", "待发队列没有未发出的稿件");
      if (!online) return reject(state, "仍处离线状态，无法下发，待发队列保留");
      let sent = 0;
      let skipped = 0;
      for (const d of pending) {
        const script = state.scripts[d.itemId];
        if (!script) {
          d.status = "失败";
          d.lastError = "稿件不存在";
          skipped += 1;
          continue;
        }
        // 待发记录的版本已被更新版本取代：不再重发旧版
        if (d.version !== script.currentVersion) {
          d.status = "失败";
          d.lastError = `已被 v${script.currentVersion} 取代，无需重发`;
          skipped += 1;
          continue;
        }
        if (script.confirmedVersion !== script.currentVersion) {
          d.lastError = `稿件 v${script.currentVersion} 未确认，无法下发`;
          skipped += 1;
          continue;
        }
        d.status = "已发";
        d.attempts += 1;
        d.sentAt = new Date().toISOString();
        d.lastError = null;
        state.teleprompter[d.itemId] = d.version;
        script.distributedVersion = d.version;
        script.status = "已下发";
        // 对账一致则解除挂起
        state.suspended = state.suspended.filter((s) => s.itemId !== d.itemId);
        sent += 1;
      }
      notify(state, sent ? "success" : "info", `重试完成：${sent} 条已下发${skipped ? `，${skipped} 条未发出` : ""}`);
    },

    /** 网络恢复对账：按条目编号核对提词器缓存版本与服务器版本，不一致的挂起并列差异 */
    reconcile(state) {
      for (const script of Object.values(state.scripts)) {
        const cached = state.teleprompter[script.itemId];
        if (cached === undefined) continue;
        if (cached === script.currentVersion) {
          state.suspended = state.suspended.filter((s) => s.itemId !== script.itemId);
          continue;
        }
        const cachedV = script.versions.find((v) => v.version === cached);
        const serverV = script.versions.find((v) => v.version === script.currentVersion);
        state.suspended = [
          ...state.suspended.filter((s) => s.itemId !== script.itemId),
          {
            itemId: script.itemId,
            title: serverV?.title ?? cachedV?.title ?? "",
            cachedVersion: cached,
            serverVersion: script.currentVersion,
            diff: diffLines(cachedV?.body ?? "", serverV?.body ?? ""),
            suspendedAt: new Date().toISOString(),
            reason: "网络恢复对账：提词器缓存版本与服务器当前版本不一致"
          }
        ];
      }
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(initialize, (state, action) => {
        for (const item of action.payload) {
          if ((item.type === "口播" || item.type === "新闻片") && !state.scripts[item.id]) {
            const created = seedScript(item);
            if (created) state.scripts[item.id] = created;
          }
        }
      })
      .addCase(addItem, (state, action) => {
        const item = action.payload;
        if (state.scripts[item.id]) return;
        const created = seedScript(item);
        if (created) state.scripts[item.id] = created;
      })
      .addCase(insertBreaking, (state, action) => {
        const item = action.payload;
        if (state.scripts[item.id]) return;
        const created = seedScript({ id: item.id, title: item.headline, type: "新闻片" });
        if (created) state.scripts[item.id] = created;
      })
      .addCase(updateStatus, (state, action) => {
        if (action.payload.status !== "已播出") return;
        const id = action.payload.id;
        const script = state.scripts[id];
        if (!script) return;
        if (state.broadcastLog.some((l) => l.itemId === id)) return;
        const readVersion = state.teleprompter[id] ?? null;
        const entry: BroadcastLogEntry = {
          id: crypto.randomUUID(),
          itemId: id,
          title: script.versions.find((v) => v.version === script.currentVersion)?.title ?? "",
          readVersion,
          serverVersion: script.currentVersion,
          matched: readVersion === script.currentVersion,
          airedAt: new Date().toISOString()
        };
        state.broadcastLog.unshift(entry);
      });
  }
});

export const { initializeScripts, openDrawer, closeDrawer, clearMessages, editScript, confirmScript, distributeScript, retryDistribution, reconcile } = slice.actions;
export default slice.reducer;
