import type { DiffLine } from "../types";

/** 基于 LCS 的行级差异：ctx 相同行、del 旧版删除行、add 新版新增行 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = (oldText ?? "").split(/\r?\n/);
  const b = (newText ?? "").split(/\r?\n/);
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ type: "ctx", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", text: a[i] });
      i++;
    } else {
      out.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < m) out.push({ type: "del", text: a[i++] });
  while (j < n) out.push({ type: "add", text: b[j++] });
  return out;
}

/** 标题差异：只有一行，直接给出旧 -> 新 */
export function diffTitle(oldTitle: string, newTitle: string): { changed: boolean; from: string; to: string } {
  return { changed: oldTitle !== newTitle, from: oldTitle, to: newTitle };
}
