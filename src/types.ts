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

/** 稿件版本：每条口播、新闻片各绑定一份稿件，每次改标题/正文生成一个新版本 */
export interface ScriptVersion {
  id: string;
  version: number;
  title: string;
  body: string;
  note: string;
  createdBy: Role;
  createdAt: string;
  /** 新版本生成后，旧版本一律作废 */
  state: "有效" | "已作废";
}

export type ScriptStatus = "草稿" | "待确认" | "已确认" | "已下发";

export interface Script {
  id: string;
  /** 绑定的串联单条目编号 */
  itemId: string;
  versions: ScriptVersion[];
  currentVersion: number;
  /** 导播已确认的版本 */
  confirmedVersion: number | null;
  /** 最近一次成功下发到提词器的版本 */
  distributedVersion: number | null;
  status: ScriptStatus;
}

export type DistributionStatus = "待发" | "已发" | "失败";

export interface DistributionRecord {
  id: string;
  itemId: string;
  version: number;
  status: DistributionStatus;
  attempts: number;
  sentAt: string | null;
  lastError: string | null;
}

/** 网络恢复对账时发现提词器缓存与服务器不一致的条目（挂起） */
export interface SuspendedItem {
  itemId: string;
  title: string;
  cachedVersion: number;
  serverVersion: number;
  diff: DiffLine[];
  suspendedAt: string;
  reason: string;
}

export interface BroadcastLogEntry {
  id: string;
  itemId: string;
  title: string;
  /** 实际念到的版本（提词器缓存版本），从未下发则为 null */
  readVersion: number | null;
  serverVersion: number;
  matched: boolean;
  airedAt: string;
}

export interface DiffLine {
  type: "add" | "del" | "ctx";
  text: string;
}

/** 需要持久化的稿件相关状态（临时消息、抽屉开关不持久化） */
export interface ScriptsPersistState {
  scripts: Record<string, Script>;
  distributions: DistributionRecord[];
  /** 提词器缓存：条目编号 -> 缓存的稿件版本 */
  teleprompter: Record<string, number>;
  suspended: SuspendedItem[];
  broadcastLog: BroadcastLogEntry[];
}
