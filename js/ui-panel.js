// ============================================================
// 车卡管理面板（点工具栏图标打开）
// 功能：粘贴/选择 JSON 文件导入车卡、列出已导入车卡、
//       绑定到选中的棋子、删除车卡
// ============================================================
import OBR from "./obr.js";
import { request, notify } from "./msg.js";
import { parseCard } from "./carddata.js";
import { esc } from "./util.js";

const app = document.getElementById("app");
let cards = [];
let lastListSig = "";

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
  // 保留正在输入的 JSON 文本，避免刷新时丢内容
  const keepText = document.getElementById("json-input") ? document.getElementById("json-input").value : "";

  const cardListHtml = cards.length
    ? cards
        .map(
          (c) => `
      <div class="card-row" data-id="${esc(c.id)}">
        <div class="avatar">${esc((c.name || "?").slice(0, 1))}</div>
        <div class="info">
          <div class="name">${esc(c.name)}</div>
          <div class="sub">LV${esc(c.level)} · ${esc(c.profession || "未知职业")}</div>
        </div>
        <button class="btn btn-sm btn-primary" data-act="bind" data-id="${esc(c.id)}">绑定到选中棋子</button>
        <button class="btn btn-sm btn-danger" data-act="del" data-id="${esc(c.id)}">删除</button>
      </div>`
        )
        .join("")
    : `<div class="center muted" style="padding:16px 0">还没有车卡。在上面粘贴 JSON 或选择 .json 文件导入。</div>`;

  app.innerHTML = `
    <div class="panel">
      <div class="app-header">
        <img src="icon.svg" alt="" />
        <span>匕首之心 · 车卡</span>
      </div>

      <div class="section">
        <div class="section-body" style="display:flex;flex-direction:column;gap:8px">
          <div class="muted">把「匕首之心角色卡工具」导出的 JSON 粘贴到下面，或点「选择文件」直接选 .json / .txt 文件。</div>
          <textarea id="json-input" placeholder='在这里粘贴车卡 JSON（以 { 开头）…'></textarea>
          <div class="row-between">
            <label class="btn btn-sm" style="cursor:pointer">
              选择文件
              <input type="file" id="file-input" accept=".json,.txt,application/json" style="display:none" />
            </label>
            <button class="btn btn-sm btn-primary" id="btn-import">导入车卡</button>
          </div>
        </div>
      </div>

      <div class="row-between">
        <b>已导入的车卡（${cards.length}）</b>
        <button class="btn btn-sm" id="btn-refresh">刷新</button>
      </div>
      <div>${cardListHtml}</div>

      <div class="muted" style="margin-top:4px">
        使用步骤：① 选中一个棋子 → ② 点某张卡旁的「绑定到选中棋子」
        （也可以在场景里<b>右键棋子</b> → 「匕首之心：绑定车卡」）→
        ③ 之后点选该棋子就会自动弹出角色卡。
      </div>
    </div>`;

  // 恢复输入内容
  const ta = document.getElementById("json-input");
  if (ta && keepText) ta.value = keepText;

  // 事件绑定
  document.getElementById("btn-import").addEventListener("click", doImport);
  document.getElementById("btn-refresh").addEventListener("click", loadCards);
  document.getElementById("file-input").addEventListener("change", onFilePicked);
  app.querySelectorAll("[data-act='bind']").forEach((btn) =>
    btn.addEventListener("click", () => doBind(btn.dataset.id))
  );
  app.querySelectorAll("[data-act='del']").forEach((btn) =>
    btn.addEventListener("click", () => doDelete(btn.dataset.id))
  );
}

// ---- 加载列表 ----
async function loadCards() {
  const res = await request("get-cards");
  cards = res.ok && Array.isArray(res.data) ? res.data : [];
  // 列表内容没变就不重绘（避免打断正在输入的文本）
  const sig = JSON.stringify(cards.map((c) => [c.id, c.name, c.level, c.profession]));
  if (sig !== lastListSig) {
    lastListSig = sig;
    render();
  }
}

// ---- 导入 ----
function onFilePicked(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById("json-input").value = String(reader.result || "");
  };
  reader.readAsText(file, "utf-8");
  e.target.value = "";
}

async function doImport() {
  const text = document.getElementById("json-input").value.trim();
  if (!text) {
    await notify("请先粘贴 JSON 或选择文件", "WARNING");
    return;
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    await notify("JSON 格式不对，解析失败：" + e.message, "ERROR");
    return;
  }
  // 先本地解析一遍，提前发现问题
  let preview;
  try {
    preview = parseCard(json);
  } catch (e) {
    await notify("车卡内容无法识别：" + e.message, "ERROR");
    return;
  }
  const res = await request("import-card", { json });
  if (res.ok) {
    await notify("导入成功：" + preview.name + "（LV" + preview.level + "）", "SUCCESS");
    document.getElementById("json-input").value = "";
    await loadCards();
  } else {
    await notify("导入失败：" + res.error, "ERROR");
  }
}

// ---- 绑定 ----
async function doBind(cardId) {
  const selRes = await request("get-selected");
  const tokenId = selRes.ok ? selRes.data : null;
  if (!tokenId) {
    await notify("请先在场景里选中一个棋子，再点绑定", "WARNING");
    return;
  }
  const res = await request("bind", { tokenId, cardId });
  if (res.ok) {
    await notify("绑定成功！点选该棋子即可看到角色卡", "SUCCESS");
  } else {
    await notify("绑定失败：" + res.error, "ERROR");
  }
}

// ---- 删除 ----
async function doDelete(cardId) {
  const card = cards.find((c) => c.id === cardId);
  if (!confirm("确定删除车卡「" + (card ? card.name : cardId) + "」吗？")) return;
  const res = await request("delete-card", { cardId });
  if (res.ok) {
    await notify("已删除", "SUCCESS");
    await loadCards();
  } else {
    await notify("删除失败：" + res.error, "ERROR");
  }
}

// ---- 启动 ----
OBR.onReady(async () => {
  await applyTheme();
  OBR.theme.onChange((t) => {
    document.body.dataset.theme = t && t.mode === "LIGHT" ? "light" : "dark";
  });
  await loadCards();
  // 房间数据变化时自动刷新（别人导入的卡也能看到）
  try {
    OBR.room.onMetadataChange(() => loadCards());
  } catch (e) {
    /* 忽略 */
  }
});
