// ============================================================
// 小工具合集：HTML 转义、轻量 Markdown 渲染
// ============================================================

/** 把用户数据安全地放进 HTML（防止名字里带 < > 破坏页面） */
export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 轻量 Markdown：把车卡描述里的
 *   **粗体**  -> <b>
 *   *斜体*    -> <i>
 *   换行      -> <br>
 * 转成 HTML（内容先转义，安全）
 */
export function mdLite(text) {
  const safe = esc(text);
  return safe
    .replace(/\*\*\*([^*]+)\*\*\*/g, "<b><i>$1</i></b>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*\n]+)\*/g, "<i>$1</i>")
    .replace(/\n/g, "<br>");
}

/** 生成随机短 id */
export function makeId(prefix = "dh") {
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}
