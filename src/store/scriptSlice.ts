import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AuditEntry, BroadcastLogEntry, DispatchRecord, ReconcileItem, Role, ScriptVersion, Suspension, TeleprompterCacheEntry } from "../types";

/** 需要岗位授权的动作；字幕、演播室只读，越权直接拒绝并记审计 */
export type GuardedAction = "编辑稿件" | "确认稿件" | "下发提词器" | "重试下发" | "对账挂起";

export const SCRIPT_ACL: Record<GuardedAction, Role[]> = {
  编辑稿件: ["主编"],
  确认稿件: ["导播"],
  下发提词器: ["导播"],
  重试下发: ["导播"],
  对账挂起: ["导播"]
};

export interface ScriptsState {
  initialized: boolean;
  versions: ScriptVersion[];
  dispatchRecords: DispatchRecord[];
  cache: TeleprompterCacheEntry[];
  teleprompterOnline: boolean;
  broadcastLog: BroadcastLogEntry[];
  suspensions: Suspension[];
  audit: AuditEntry[];
}

export type ScriptsPersisted = Omit<ScriptsState, "initialized">;

export const toPersisted = (state: ScriptsState): ScriptsPersisted => ({
  versions: state.versions,
  dispatchRecords: state.dispatchRecords,
  cache: state.cache,
  teleprompterOnline: state.teleprompterOnline,
  broadcastLog: state.broadcastLog,
  suspensions: state.suspensions,
  audit: state.audit
});

const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const cut = (text: string, len = 26) => (text.length > len ? `${text.slice(0, len)}…` : text);

const seedVersions: ScriptVersion[] = [
  { id: "sv-r1-1", itemId: "r1", version: 1, title: "早间新闻提要", body: "口播正文：今晨要闻三条，首先是城市更新方案发布……", status: "已下发", updatedBy: "主编", updatedAt: "2026-10-08T06:40:00.000Z" },
  { id: "sv-r5-1", itemId: "r5", version: 1, title: "午间快讯口播", body: "旧版正文：两市早盘高开，沪指涨0.8%……", status: "已作废", updatedBy: "主编", updatedAt: "2026-10-08T06:50:00.000Z" },
  { id: "sv-r5-2", itemId: "r5", version: 2, title: "午间快讯口播（更新）", body: "新版正文：两市午后翻红，央行今日开展500亿元逆回购操作……", status: "待确认", updatedBy: "主编", updatedAt: "2026-10-08T07:12:00.000Z" },
  { id: "sv-r6-1", itemId: "r6", version: 1, title: "台风路径最新通报", body: "口播正文：今年第14号台风中心位于北纬19.2度……", status: "已确认", updatedBy: "主编", updatedAt: "2026-10-08T07:05:00.000Z" }
];

const seedDispatch: DispatchRecord[] = [
  { id: "dp-r1-1", itemId: "r1", version: 1, target: "提词器-A", status: "已送达", attempts: 1, updatedAt: "2026-10-08T06:41:00.000Z" },
  { id: "dp-r5-1", itemId: "r5", version: 1, target: "提词器-A", status: "已送达", attempts: 1, updatedAt: "2026-10-08T06:51:00.000Z" }
];

const seedCache: TeleprompterCacheEntry[] = [
  { itemId: "r1", version: 1, title: "早间新闻提要", body: "口播正文：今晨要闻三条，首先是城市更新方案发布……" },
  { itemId: "r5", version: 1, title: "午间快讯口播", body: "旧版正文：两市早盘高开，沪指涨0.8%……" }
];

const seedLog: BroadcastLogEntry[] = [
  { id: "bl-r1", itemId: "r1", title: "早间新闻提要", versionRead: 1, via: "在线", airedAt: "2026-10-08T08:02:00.000Z" }
];

const initialState: ScriptsState = {
  initialized: false,
  versions: seedVersions,
  dispatchRecords: seedDispatch,
  cache: seedCache,
  teleprompterOnline: true,
  broadcastLog: seedLog,
  suspensions: [],
  audit: []
};

function latestOf(state: ScriptsState, itemId: string): ScriptVersion | undefined {
  return state.versions.filter((v) => v.itemId === itemId).sort((a, b) => b.version - a.version)[0];
}

function log(state: ScriptsState, role: string, action: string, detail: string, rejected = false) {
  state.audit.unshift({ id: uuid(), time: now(), role, action, detail, rejected });
}

/** 岗位校验：越权操作直接拒绝并写审计，状态不变 */
function permit(state: ScriptsState, role: Role, action: GuardedAction, auto?: boolean): boolean {
  if (auto) return true;
  if (SCRIPT_ACL[action].includes(role)) return true;
  log(state, role, action, `越权操作已拒绝：「${role}」岗位无权执行「${action}」`, true);
  return false;
}

/** 送达指定版本：更新下发记录与提词器缓存；送达最新版时自动解除挂起 */
function deliver(state: ScriptsState, itemId: string, version: number): boolean {
  const script = state.versions.find((v) => v.itemId === itemId && v.version === version);
  if (!script || script.status === "已作废") return false;
  const record = state.dispatchRecords.find((r) => r.itemId === itemId && r.version === version);
  if (record) {
    if (record.status !== "已送达") {
      record.status = "已送达";
      record.updatedAt = now();
    }
  } else {
    state.dispatchRecords.unshift({ id: uuid(), itemId, version, target: "提词器-A", status: "已送达", attempts: 1, updatedAt: now() });
  }
  script.status = "已下发";
  const cached = state.cache.find((e) => e.itemId === itemId);
  if (cached) {
    cached.version = script.version;
    cached.title = script.title;
    cached.body = script.body;
  } else {
    state.cache.push({ itemId, version: script.version, title: script.title, body: script.body });
  }
  const latest = latestOf(state, itemId);
  if (latest && latest.version === version) {
    state.suspensions.forEach((s) => {
      if (s.itemId === itemId) s.resolved = true;
    });
  }
  return true;
}

const slice = createSlice({
  name: "scripts",
  initialState,
  reducers: {
    initializeScripts(state, action: PayloadAction<ScriptsPersisted | null>) {
      if (state.initialized) return;
      if (action.payload) Object.assign(state, action.payload);
      state.initialized = true;
    },
    /** 新增口播/新闻片条目时绑定首版稿件 */
    createScript(state, action: PayloadAction<{ itemId: string; title: string }>) {
      if (state.versions.some((v) => v.itemId === action.payload.itemId)) return;
      state.versions.push({ id: uuid(), itemId: action.payload.itemId, version: 1, title: action.payload.title, body: "", status: "待确认", updatedBy: "系统", updatedAt: now() });
    },
    /** 主编改稿：生成新版本，已下发/已确认的旧版本全部作废，未播条目需重新确认 */
    editScript(state, action: PayloadAction<{ role: Role; itemId: string; title: string; body: string }>) {
      const { role, itemId, title, body } = action.payload;
      if (!permit(state, role, "编辑稿件")) return;
      const latest = latestOf(state, itemId);
      const next = (latest?.version ?? 0) + 1;
      state.versions.forEach((v) => {
        if (v.itemId === itemId && v.status !== "已作废") v.status = "已作废";
      });
      state.versions.push({ id: uuid(), itemId, version: next, title, body, status: "待确认", updatedBy: role, updatedAt: now() });
      log(state, role, "编辑稿件", `「${title}」生成 v${next}，旧版本已作废，未播条目需重新确认后才能下发`);
    },
    /** 导播确认最新版本，确认后才允许下发 */
    confirmScript(state, action: PayloadAction<{ role: Role; itemId: string; itemStatus: string }>) {
      const { role, itemId, itemStatus } = action.payload;
      if (!permit(state, role, "确认稿件")) return;
      if (itemStatus === "已播出") {
        log(state, role, "确认稿件", "操作被拒绝：条目已播出，无需再确认下发", true);
        return;
      }
      const latest = latestOf(state, itemId);
      if (!latest || latest.status !== "待确认") {
        log(state, role, "确认稿件", "操作被拒绝：当前没有待确认的稿件版本", true);
        return;
      }
      latest.status = "已确认";
      log(state, role, "确认稿件", `「${latest.title}」v${latest.version} 已确认，可以下发`);
    },
    /** 导播下发到提词器：同一条目同一版本只记一次；断网时留在待发队列 */
    dispatchScript(state, action: PayloadAction<{ role: Role; itemId: string; itemStatus: string }>) {
      const { role, itemId, itemStatus } = action.payload;
      if (!permit(state, role, "下发提词器")) return;
      if (itemStatus === "已播出") {
        log(state, role, "下发提词器", "操作被拒绝：条目已播出，以播出日志为准", true);
        return;
      }
      const latest = latestOf(state, itemId);
      if (!latest) {
        log(state, role, "下发提词器", "操作被拒绝：条目未绑定稿件", true);
        return;
      }
      if (latest.status === "待确认") {
        log(state, role, "下发提词器", `操作被拒绝：「${latest.title}」v${latest.version} 未确认，未播条目需重新确认后才能下发`, true);
        return;
      }
      if (latest.status === "已作废") {
        log(state, role, "下发提词器", "操作被拒绝：稿件版本已作废", true);
        return;
      }
      const existing = state.dispatchRecords.find((r) => r.itemId === itemId && r.version === latest.version);
      if (existing) {
        log(state, role, "下发提词器", `重复下发只记一次：「${latest.title}」v${latest.version} ${existing.status === "已送达" ? "已送达" : "已在待发队列"}`);
        return;
      }
      if (state.teleprompterOnline) {
        deliver(state, itemId, latest.version);
        log(state, role, "下发提词器", `「${latest.title}」v${latest.version} 已送达提词器`);
      } else {
        state.dispatchRecords.unshift({ id: uuid(), itemId, version: latest.version, target: "提词器-A", status: "待发", attempts: 1, updatedAt: now() });
        log(state, role, "下发提词器", `提词器断网：「${latest.title}」v${latest.version} 留在待发队列`);
      }
    },
    /** 重试：只发没发出去的部分，已送达记录不动，已作废版本标记取代 */
    retryDispatch(state, action: PayloadAction<{ role: Role; auto?: boolean }>) {
      const { role, auto } = action.payload;
      if (!permit(state, role, "重试下发", auto)) return;
      let sent = 0;
      let superseded = 0;
      let pending = 0;
      state.dispatchRecords.forEach((record) => {
        if (record.status === "已送达" || record.status === "已取代") return;
        record.attempts += 1;
        record.updatedAt = now();
        const script = state.versions.find((v) => v.itemId === record.itemId && v.version === record.version);
        if (!script || script.status === "已作废") {
          record.status = "已取代";
          superseded += 1;
          return;
        }
        if (state.teleprompterOnline) {
          deliver(state, record.itemId, record.version);
          sent += 1;
        } else {
          record.status = "待发";
          pending += 1;
        }
      });
      log(state, auto ? "系统" : role, "重试下发", `重试未送达部分：送达 ${sent} 条，已取代 ${superseded} 条，仍待发 ${pending} 条`);
    },
    setTeleprompterOnline(state, action: PayloadAction<boolean>) {
      state.teleprompterOnline = action.payload;
    },
    /** 对账：按条目编号 + 稿件版本核对缓存；已播条目补录实际播出版本，未播不一致挂起并列差异 */
    reconcile(state, action: PayloadAction<{ role: Role; items: ReconcileItem[]; auto?: boolean }>) {
      const { role, items, auto } = action.payload;
      if (!permit(state, role, "对账挂起", auto)) return;
      let suspended = 0;
      let logged = 0;
      let matched = 0;
      items
        .filter((item) => item.type === "口播" || item.type === "新闻片")
        .forEach((item) => {
          const cached = state.cache.find((e) => e.itemId === item.id);
          const latest = latestOf(state, item.id);
          if (!latest) return;
          if (item.status === "已播出") {
            if (!state.broadcastLog.some((entry) => entry.itemId === item.id)) {
              state.broadcastLog.unshift({ id: uuid(), itemId: item.id, title: item.title, versionRead: cached?.version ?? latest.version, via: cached && cached.version !== latest.version ? "断网缓存" : "在线", airedAt: now() });
              logged += 1;
            }
            return;
          }
          if (!cached) return;
          if (cached.version !== latest.version) {
            if (!state.suspensions.some((s) => s.itemId === item.id && !s.resolved)) {
              const diffs = [`版本 v${cached.version} → v${latest.version}`];
              if (cached.title !== latest.title) diffs.push(`标题：「${cached.title}」→「${latest.title}」`);
              if (cached.body !== latest.body) diffs.push(`正文：「${cut(cached.body)}」→「${cut(latest.body)}」`);
              state.suspensions.unshift({ id: uuid(), itemId: item.id, cachedVersion: cached.version, latestVersion: latest.version, diffs, suspendedAt: now(), resolved: false });
              suspended += 1;
            }
          } else {
            state.suspensions.forEach((s) => {
              if (s.itemId === item.id) s.resolved = true;
            });
            matched += 1;
          }
        });
      log(state, auto ? "系统" : role, "对账挂起", `对账完成：挂起 ${suspended} 条，补录播出日志 ${logged} 条，版本一致 ${matched} 条`);
    },
    /** 条目播出时记录实际念到的版本：断网念缓存稿，在线念提词器当前稿；同一条目只记一次 */
    markAired(state, action: PayloadAction<{ itemId: string; title: string }>) {
      const { itemId, title } = action.payload;
      if (state.broadcastLog.some((entry) => entry.itemId === itemId)) return;
      const cached = state.cache.find((e) => e.itemId === itemId);
      const latest = latestOf(state, itemId);
      if (!cached && !latest) return;
      const versionRead = cached?.version ?? latest?.version ?? 0;
      const via = state.teleprompterOnline ? "在线" : "断网缓存";
      state.broadcastLog.unshift({ id: uuid(), itemId, title, versionRead, via, airedAt: now() });
      log(state, "系统", "播出日志", `「${title}」实际播出 v${versionRead}（${via}）`);
    },
    /** 导播处理挂起条目 */
    resolveSuspension(state, action: PayloadAction<{ role: Role; id: string; note: string }>) {
      const { role, id, note } = action.payload;
      if (!permit(state, role, "对账挂起")) return;
      const target = state.suspensions.find((s) => s.id === id);
      if (!target || target.resolved) return;
      target.resolved = true;
      log(state, role, "对账挂起", `挂起已处理：${note}`);
    }
  }
});

export const { initializeScripts, createScript, editScript, confirmScript, dispatchScript, retryDispatch, setTeleprompterOnline, reconcile, markAired, resolveSuspension } = slice.actions;
export default slice.reducer;
