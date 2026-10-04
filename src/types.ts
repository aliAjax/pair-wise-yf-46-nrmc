export type Role = "导播" | "主编" | "字幕" | "演播室";
export type ItemType = "新闻片" | "连线" | "嘉宾" | "口播" | "广告";
export type ItemStatus = "待播" | "已播出" | "已跳过" | "草稿";

export interface RundownItem {
  id: string;
  title: string;
  type: ItemType;
  duration: number;
  hardStart?: string;
  status: ItemStatus;
  presenter: string;
  source: string;
}

export interface BreakingChange {
  id: string;
  headline: string;
  duration: number;
  insertAfter: string;
  reason: string;
  createdAt: string;
}

export interface PendingChange {
  id: string;
  action: string;
  detail: string;
  queuedAt: string;
}

export interface HistoryEntry {
  id: string;
  label: string;
  detail: string;
  time: string;
  snapshot: RundownItem[];
}

/** 稿件版本状态：待确认 → 已确认 → 已下发；主编改稿后旧版本作废 */
export type ScriptStatus = "待确认" | "已确认" | "已下发" | "已作废";

/** 稿件版本，绑定到串联单条目（口播 / 新闻片） */
export interface ScriptVersion {
  id: string;
  itemId: string;
  version: number;
  title: string;
  body: string;
  status: ScriptStatus;
  updatedBy: string;
  updatedAt: string;
}

/** 下发记录状态：待发（断网留在队列）→ 已送达；版本被取代后不再重试 */
export type DispatchStatus = "待发" | "已送达" | "已取代";

/** 提词器下发记录，同一条目同一版本只记一次 */
export interface DispatchRecord {
  id: string;
  itemId: string;
  version: number;
  target: string;
  status: DispatchStatus;
  attempts: number;
  updatedAt: string;
}

/** 提词器本地缓存的稿件快照，断网时主播念的就是这一份 */
export interface TeleprompterCacheEntry {
  itemId: string;
  version: number;
  title: string;
  body: string;
}

/** 播出日志：已播条目实际念到的稿件版本 */
export interface BroadcastLogEntry {
  id: string;
  itemId: string;
  title: string;
  versionRead: number;
  via: "在线" | "断网缓存";
  airedAt: string;
}

/** 对账挂起：缓存版本与最新版本不一致的未播条目 */
export interface Suspension {
  id: string;
  itemId: string;
  cachedVersion: number;
  latestVersion: number;
  diffs: string[];
  suspendedAt: string;
  resolved: boolean;
}

/** 稿件操作审计，越权拒绝也会留痕 */
export interface AuditEntry {
  id: string;
  time: string;
  role: string;
  action: string;
  detail: string;
  rejected?: boolean;
}

/** 对账时需要的条目信息 */
export interface ReconcileItem {
  id: string;
  title: string;
  status: ItemStatus;
  type: ItemType;
}
