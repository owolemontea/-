// ============================================================
// 绑定车卡弹窗（右键棋子 -> 匕首之心：绑定车卡）
// 列出所有已导入的车卡，点一下即可绑定到该棋子；已绑定的可解绑。
// ============================================================
import OBR from "./obr.js";
import { request, notify } from "./msg.js";
import { esc } from "./util.js";

const app = document.getElementById("app");

const params = new URLSearchParams(window.location.search);
const tokenId = params.get("tokenId") || "";

let cards = [];
let binding = null; // 当前棋子已绑定的车卡 id

// ---- 主题 ----
async function applyTheme() {
  try {
    const t = await OBR.theme.getTheme();
    document.body.dataset.theme = t && t.mode === "LIGHT" ? "light" : "dark";
  } catch (e) {
    document.body.dataset.theme = "dark";
  }
}

// ---- 渲染 ----
function render() {
  const boundCard = cards.find((c) => c.id === binding);
  const listHtml = cards.length
    ? cards
        .map(
          (c) => `
        <div class="card-row ${c.id === binding ? "bound" : ""}">
          <div class="avatar">${esc((c.name || "?").slice(0, 1))}</div>
          <div class="info">
            <div class="name">${esc(c.name)}</div>
            <div class="sub">LV${esc(c.level)} · ${esc(c.profession || "")}</div>
          </div>
          <button class="btn btn-sm btn-primary" data-bind="${esc(c.id)}">
            ${c.id === binding ? "已绑定" : "绑定"}
          </button>
        </div>`
        )
        .join("")
    : `<div class="center muted" style="padding:16px 0">还没有车卡。<br>先点工具栏的匕首图标导入 JSON。</div>`;

  app.innerHTML = `
    <div class="panel">
      <div class="app-header">
        <img src="icon.svg" alt="" />
        <span>绑定车卡到棋子</span>
      </div>
      <div class="muted">
        ${boundCard ? `当前绑定：<b>${esc(boundCard.name)}</b>` : "当前未绑定车卡"}
      </div>
      <div>${listHtml}</div>
      ${binding ? `<button class="btn btn-danger btn-block" id="btn-unbind">解除绑定</button>` : ""}
      <button class="btn btn-block" id="btn-close">关闭</button>
    </div>`;

  app.querySelectorAll("[data-bind]").forEach((el) => {
    el.addEventListener("click", () => doBind(el.dataset.bind));
  });
  const btnUnbind = document.getElementById("btn-unbind");
  if (btnUnbind) btnUnbind.addEventListener("click", doUnbind);
  document.getElementById("btn-close").addEventListener("click", () =>
    OBR.popover.close("dh-bind")
  );
}

// ---- 操作 ----
async function doBind(cardId) {
  const res = await request("bind", { tokenId, cardId });
  if (res.ok) {
    await notify("绑定成功！点选该棋子即可看到角色卡", "SUCCESS");
    await OBR.popover.close("dh-bind");
  } else {
    await notify("绑定失败：" + res.error, "ERROR");
  }
}

async function doUnbind() {
  const res = await request("unbind", { tokenId });
  if (res.ok) {
    await notify("已解除绑定", "SUCCESS");
    binding = null;
    render();
  } else {
    await notify("解绑失败：" + res.error, "ERROR");
  }
}

// ---- 启动 ----
OBR.onReady(async () => {
  await applyTheme();
  const res = await request("get-cards");
  cards = res.ok && Array.isArray(res.data) ? res.data : [];
  const b = await request("get-binding", { tokenId });
  binding = b.ok ? b.data : null;
  render();
});
