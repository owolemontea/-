// ============================================================
// 投骰弹窗（参考 obr-suite 骰子面板的体验）
// 功能：
//   - 打开时默认填入对应的骰子（比如武器命中 2d12+3）
//   - 表达式输入框：直接输入 2d12+3 回车生效，中文标点自动识别
//   - 示例按钮一键填入（2d12+3 / 3d10+6 / 优势 / 劣势）
//   - 骰子数量/面数/加值 全部可调，可增删骰子段
//   - 优势（+1d6）/ 劣势（-1d6）切换
//   - 暗骰（仅主持人）：只有自己能看到结果
//   - 历史记录：最近 30 次投骰，点击重新填入
//   - 点「投掷」-> 全场播放骰子特效动画 + 棋子上方浮动结果
// ============================================================
import OBR from "./obr.js";
import { request } from "./msg.js";
import { parseExpression, formatExpression, normalizeExpr } from "./dice-engine.js";
import { esc } from "./util.js";

const app = document.getElementById("app");

const params = new URLSearchParams(window.location.search);
const title = params.get("title") || "投骰";
const tokenId = params.get("tokenId") || "";

const SIDES_OPTIONS = [4, 6, 8, 10, 12, 20, 40, 60, 80, 100, 120, 200, 1000];
const EXAMPLES = ["2d12+3", "3d10+6", "2d12+3+1d6", "2d12+3-1d6", "1d6", "1d12", "1d20"];
const HIST_KEY = "dh/dice-history";

let segments = [];
let flat = 0;
let mode = "normal"; // normal | adv | dis
let lastRoll = null; // 上一次投掷结果
let isGM = false;
let dark = false;
let histOpen = false;

// ---- 主题 ----
async function applyTheme() {
  try {
    const t = await OBR.theme.getTheme();
    document.body.dataset.theme = t && t.mode === "LIGHT" ? "light" : "dark";
  } catch (e) {
    document.body.dataset.theme = "dark";
  }
}

// ---- 历史 ----
function loadHistory() {
  try {
    const h = JSON.parse(localStorage.getItem(HIST_KEY) || "[]");
    return Array.isArray(h) ? h : [];
  } catch (e) {
    return [];
  }
}

function pushHistory(entry) {
  const h = loadHistory();
  h.unshift(entry);
  localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(0, 30)));
}

function clearHistory() {
  localStorage.removeItem(HIST_KEY);
  render();
}

// ---- 表达式 <-> 骰段 同步 ----
function applyExprToSegments(text) {
  const parsed = parseExpression(text);
  if (parsed.segments.length === 0 && parsed.flat === 0) return false;
  segments = parsed.segments;
  flat = parsed.flat;
  return true;
}

// ---- 渲染 ----
function render() {
  const diceRows = segments
    .map((seg, i) => `
      <div class="dice-row">
        <button class="btn btn-sm btn-icon" data-sign="${i}">${seg.sign < 0 ? "−" : "＋"}</button>
        <button class="btn btn-sm btn-icon" data-dec="${i}">−</button>
        <span class="count">${seg.count}</span>
        <button class="btn btn-sm btn-icon" data-inc="${i}">＋</button>
        <select data-sides="${i}">
          ${SIDES_OPTIONS.map((s) => `<option value="${s}" ${s === seg.sides ? "selected" : ""}>d${s}</option>`).join("")}
        </select>
        <button class="btn btn-sm btn-danger btn-icon" data-rm="${i}" title="移除这组骰子">✕</button>
      </div>`)
    .join("");

  const modeBtn = (key, label) => `
    <button class="mode-btn ${mode === key ? "active" : ""}" data-mode="${key}">${label}</button>`;

  const resultHtml = lastRoll
    ? `
    <div class="result-box">
      <div class="result-total">${lastRoll.total}</div>
      <div class="result-expr">${esc(lastRoll.expression)}${lastRoll.hopeDie !== null ? "（希望 " + lastRoll.hopeDie + " · 恐惧 " + lastRoll.fearDie + "）" : ""}</div>
      <div class="result-groups">
        ${lastRoll.groups
          .map((g, gi) => `
          <div class="result-group">
            <span class="muted">${g.sign < 0 ? "−" : ""}${esc(g.label)} = ${g.sign < 0 ? "-" : ""}${g.sum}</span>
            ${g.values
              .map((v, vi) => {
                let cls = "die-chip";
                if (gi === 0 && lastRoll.hopeDie !== null && vi === 0) cls += " hope";
                else if (gi === 0 && lastRoll.hopeDie !== null && vi === 1) cls += " fear";
                return `<span class="${cls}">${v}</span>`;
              })
              .join("")}
          </div>`)
          .join("")}
      </div>
      <div class="row" style="margin-top:8px;justify-content:center">
        <button class="btn btn-primary" id="btn-roll-again">再来一次</button>
      </div>
    </div>`
    : "";

  const history = loadHistory();
  const historyHtml = histOpen
    ? `
    <div class="section open">
      <div class="section-title" data-hist-toggle>
        <span>历史记录（${history.length}）</span>
        <span class="arrow">▼</span>
      </div>
      <div class="section-body" style="max-height:170px;overflow-y:auto">
        ${history.length
          ? history
              .map((h, i) => `
              <div class="hist-row" data-hist="${i}">
                <div class="grow">
                  <b>${esc(h.expr)} → ${h.total}</b>
                  <div class="muted">${esc(h.title || "投骰")}${h.hopeDie !== null ? " · 希望" + h.hopeDie + " 恐惧" + h.fearDie : ""}</div>
                </div>
                <button class="btn btn-sm btn-danger btn-icon" data-hist-del="${i}" title="删除这条">✕</button>
              </div>`)
              .join("")
          : `<div class="muted center">还没有投骰记录</div>`}
        <div class="center" style="margin-top:6px">
          <button class="btn btn-sm" id="btn-hist-clear">清空历史</button>
        </div>
      </div>
    </div>`
    : `
    <div class="section">
      <div class="section-title" data-hist-toggle>
        <span>历史记录（${history.length}）</span>
        <span class="arrow">▶</span>
      </div>
    </div>`;

  app.innerHTML = `
    <div class="panel">
      <div class="dice-title">🎲 ${esc(title)}</div>

      <div>
        <input type="text" id="expr-input" placeholder="输入表达式，如 2d12+3（回车生效）" spellcheck="false" />
      </div>
      <div class="chips-row">
        ${EXAMPLES.map((e) => `<button class="chip" data-example="${esc(e)}">${esc(e)}</button>`).join("")}
      </div>

      <div id="dice-rows">${diceRows}</div>
      <div class="row" style="justify-content:center;padding-top:4px">
        <button class="btn btn-sm" id="btn-add-dice">＋ 加一组骰子</button>
      </div>

      <div class="dice-row">
        <span style="min-width:70px">固定加值</span>
        <button class="btn btn-sm btn-icon" data-flat-dec>−</button>
        <span class="count">${flat > 0 ? "+" + flat : flat}</span>
        <button class="btn btn-sm btn-icon" data-flat-inc>＋</button>
      </div>

      <div class="mode-row">
        ${modeBtn("normal", "普通")}
        ${modeBtn("adv", "优势 +1d6")}
        ${modeBtn("dis", "劣势 −1d6")}
      </div>

      ${isGM ? `
      <div class="row dark-row">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none">
          <input type="checkbox" id="dark-toggle" ${dark ? "checked" : ""} />
          <span>暗骰（只有我看得到结果）</span>
        </label>
      </div>` : ""}

      <button class="btn btn-primary btn-block" id="btn-roll">投掷 🎲</button>

      ${resultHtml}
      ${historyHtml}

      <div class="muted center">表达式：${esc(formatExpression(segments, flat))}</div>
    </div>`;

  // 输入框的值（不打断正在输入的文本）
  const input = document.getElementById("expr-input");
  if (input && document.activeElement !== input) {
    input.value = formatExpression(segments, flat);
  }

  bindEvents();
}

function bindEvents() {
  // 表达式输入：回车或失焦时生效
  const input = document.getElementById("expr-input");
  if (input) {
    const commit = () => {
      if (applyExprToSegments(input.value)) {
        input.classList.remove("invalid");
        render();
      } else if (normalizeExpr(input.value) !== "") {
        input.classList.add("invalid");
      }
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") commit();
    });
    input.addEventListener("blur", commit);
  }

  // 示例按钮
  app.querySelectorAll("[data-example]").forEach((el) => {
    el.addEventListener("click", () => {
      const text = el.dataset.example;
      if (applyExprToSegments(text)) {
        mode = "normal";
        render();
        const inp = document.getElementById("expr-input");
        if (inp) inp.value = text;
      }
    });
  });

  // 骰子段操作
  app.querySelectorAll("[data-inc]").forEach((el) => {
    el.addEventListener("click", () => {
      segments[Number(el.dataset.inc)].count = Math.min(20, segments[Number(el.dataset.inc)].count + 1);
      render();
    });
  });
  app.querySelectorAll("[data-dec]").forEach((el) => {
    el.addEventListener("click", () => {
      const seg = segments[Number(el.dataset.dec)];
      seg.count = Math.max(0, seg.count - 1);
      if (seg.count === 0) segments.splice(Number(el.dataset.dec), 1);
      render();
    });
  });
  app.querySelectorAll("[data-sign]").forEach((el) => {
    el.addEventListener("click", () => {
      segments[Number(el.dataset.sign)].sign *= -1;
      render();
    });
  });
  app.querySelectorAll("[data-sides]").forEach((el) => {
    el.addEventListener("change", () => {
      segments[Number(el.dataset.sides)].sides = Number(el.value);
      render();
    });
  });
  app.querySelectorAll("[data-rm]").forEach((el) => {
    el.addEventListener("click", () => {
      segments.splice(Number(el.dataset.rm), 1);
      render();
    });
  });

  // 模式
  app.querySelectorAll("[data-mode]").forEach((el) => {
    el.addEventListener("click", () => {
      mode = el.dataset.mode;
      render();
    });
  });

  // 固定加值
  app.querySelectorAll("[data-flat-inc]").forEach((el) => {
    el.addEventListener("click", () => {
      flat += 1;
      render();
    });
  });
  app.querySelectorAll("[data-flat-dec]").forEach((el) => {
    el.addEventListener("click", () => {
      flat -= 1;
      render();
    });
  });

  // 暗骰
  const darkToggle = document.getElementById("dark-toggle");
  if (darkToggle)
    darkToggle.addEventListener("change", () => {
      dark = darkToggle.checked;
    });

  // 历史
  app.querySelectorAll("[data-hist-toggle]").forEach((el) => {
    el.addEventListener("click", () => {
      histOpen = !histOpen;
      render();
    });
  });
  app.querySelectorAll("[data-hist]").forEach((el) => {
    el.addEventListener("click", () => {
      const h = loadHistory()[Number(el.dataset.hist)];
      if (!h) return;
      if (applyExprToSegments(h.expr)) {
        mode = h.mode || "normal";
        render();
      }
    });
  });
  app.querySelectorAll("[data-hist-del]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const h = loadHistory();
      h.splice(Number(el.dataset.histDel), 1);
      localStorage.setItem(HIST_KEY, JSON.stringify(h));
      render();
    });
  });
  const btnHistClear = document.getElementById("btn-hist-clear");
  if (btnHistClear) btnHistClear.addEventListener("click", clearHistory);

  // 按钮
  const btnAdd = document.getElementById("btn-add-dice");
  if (btnAdd)
    btnAdd.addEventListener("click", () => {
      segments.push({ count: 1, sides: 6, sign: 1 });
      render();
    });

  const btnRoll = document.getElementById("btn-roll");
  if (btnRoll) btnRoll.addEventListener("click", doRoll);

  const btnAgain = document.getElementById("btn-roll-again");
  if (btnAgain) btnAgain.addEventListener("click", doRoll);
}

// ---- 投掷 ----
async function doRoll() {
  if (segments.length === 0) {
    try {
      await OBR.notification.show("请至少保留一组骰子", "WARNING");
    } catch (e) { /* 忽略 */ }
    return;
  }
  const res = await request("roll", { title, segments, flat, mode, tokenId, hidden: dark });
  if (res.ok && res.data && res.data.result) {
    lastRoll = res.data.result;
    pushHistory({
      expr: lastRoll.expression,
      mode,
      title,
      total: lastRoll.total,
      hopeDie: lastRoll.hopeDie,
      fearDie: lastRoll.fearDie,
      time: Date.now(),
    });
    render();
  } else {
    try {
      await OBR.notification.show("投掷失败：" + (res.error || "未知错误"), "ERROR");
    } catch (e) { /* 忽略 */ }
  }
}

// ---- 启动 ----
OBR.onReady(async () => {
  await applyTheme();
  try {
    isGM = (await OBR.player.getRole()) === "GM";
  } catch (e) {
    isGM = false;
  }
  // 解析 URL 传来的默认表达式
  const parsed = parseExpression(params.get("expr") || "2d12");
  segments = parsed.segments.length ? parsed.segments : [{ count: 2, sides: 12, sign: 1 }];
  flat = parsed.flat || 0;
  render();
});
