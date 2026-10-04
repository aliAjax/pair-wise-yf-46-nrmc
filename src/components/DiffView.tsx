import type { DiffLine } from "../types";

/** 稿件版本差异：绿=新增行，红=删除行，灰=相同行 */
export function DiffView({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="diff-view">
      {lines.map((line, i) => (
        <div key={i} className={`diff-line ${line.type}`}>
          <span className="diff-gutter">{line.type === "add" ? "+" : line.type === "del" ? "-" : " "}</span>
          <span className="diff-text">{line.text || " "}</span>
        </div>
      ))}
    </div>
  );
}
