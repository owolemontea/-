// ============================================================
// 骰子特效页（全屏、点击穿透，参考 obr-suite 的效果页思路简化实现）
// 流程：每颗骰子随机方向飞入（0~0.9 秒）→ 老虎机式数字滚动
//       → 定格（希望骰蓝光 / 恐惧骰红光）→ 结果大字弹出 → 淡出关闭
// 每个客户端各渲染一份（由后台广播驱动打开）。
// ============================================================
import OBR from "./obr.js";

const params = new URLSearchParams(window.location.search);
const rollId = params.get("rollId") || "x";
const MODAL_ID = "dh-effect-" + rollId;

// ---- 参数解析 ----
let dice = [];
try {
  dice = JSON.parse(params.get("dice") || "[]");
} catch (e) {
  dice = [];
}
const total = parseInt(params.get("total") || "0", 10);
const expr = params.get("expr") || "";
const label = params.get("label") || "";
const color = params.get("color") || "#b79aff";
const hopeDie = params.get("hope");
const fearDie = params.get("fear");

// ---- 构建画面 ----
const stage = document.getElementById("stage");

stage.innerHTML = `
  <div class="effect-label" style="color:${color}">${escapeHtml(label)}</div>
  <div class="effect-dice-row" id="dice-row"></div>
  <div class="effect-total" id="total" style="display:none">= ${total}</div>
  <div class="effect-sub" id="sub" style="display:none">${escapeHtml(expr)}${
    hopeDie !== null && hopeDie !== "" ? "（希望" + escapeHtml(hopeDie) + " 恐惧" + escapeHtml(fearDie) + "）" : ""
  }</div>
`;

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const diceRow = document.getElementById("dice-row");

// 每颗骰子一个芯片：随机飞入方向 + 老虎机滚动
const chips = dice.map((d, i) => {
  const kind = d.kind || ""; // hope | fear | adv | sub
  const fx = (Math.random() * 600 - 300) + "px";
  const fy = -(200 + Math.random() * 500) + "px";
  const rot = (Math.random() * 360 - 180) + "deg";
  const el = document.createElement("div");
  el.className = "effect-die " + (kind === "hope" ? "hope " : "") + (kind === "fear" ? "fear " : "") +
    (kind === "adv" ? "adv " : "") + (kind === "sub" ? "sub " : "");
  el.style.setProperty("--fx", fx);
  el.style.setProperty("--fy", fy);
  el.style.setProperty("--rot", rot);
  el.style.animationDelay = i * 90 + "ms";
  el.innerHTML = `
    <div class="num">?</div>
    <div class="cap">${d.sign < 0 ? "−" : ""}d${d.sides}</div>`;
  diceRow.appendChild(el);
  return { el, numEl: el.querySelector(".num"), sides: d.sides, value: d.value, kind };
});

// 老虎机滚动：每 65ms 换一个随机数
const spin = setInterval(() => {
  chips.forEach((c) => {
    c.numEl.textContent = 1 + Math.floor(Math.random() * c.sides);
  });
}, 65);

// 定格
setTimeout(() => {
  clearInterval(spin);
  chips.forEach((c) => {
    c.numEl.textContent = c.value;
    c.el.classList.add("locked");
  });
  document.getElementById("total").style.display = "block";
  document.getElementById("sub").style.display = "block";
}, 1350);

// 淡出 + 关闭
setTimeout(() => stage.classList.add("fade"), 4300);
OBR.onReady(() => {
  setTimeout(() => {
    try {
      OBR.modal.close(MODAL_ID);
    } catch (e) {
      /* 已关闭 */
    }
  }, 4700);
});
