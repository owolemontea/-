// ============================================================
// 角色卡弹窗（选中绑定的棋子时自动弹出）
// 功能：
//   - 展示属性/闪避/伤害阈值/生命/压力/希望/护甲/金币/武器/经历/职业/领域卡
//   - 点击属性、武器命中/伤害 -> 打开投骰弹窗（默认骰子已填好）
//   - 生命/压力/护甲/金币可点击方格、希望可 +/-，改动同步给全房间
// ============================================================
import OBR from "./obr.js";
import { request } from "./msg.js";
import { ATTR_NAMES, ATTR_ORDER, weaponAttack, weaponDamage } from "./carddata.js";
import { esc, mdLite } from "./util.js";

const app = document.getElementById("app");

const params = new URLSearchParams(window.location.search);
const cardId = params.get("cardId") || "";
const tokenId = params.get("tokenId") || "";

let card = null; // { id, name, level, profession, importedAt, data }
let lastSig = "";
const openSections = new Set(["basic"]);

const CARD_TYPE_NAMES = {
  profession: "职业特性",
  subclass: "子职业",
  ancestry: "血脉",
  community: "社群",
};

// ---- 主题 ----
async function applyTheme() {
  try {
    const t = await OBR.theme.getTheme();
    document.body.dataset.theme = t && t.mode === "LIGHT" ? "light" : "dark";
  } catch (e) {
    document.body.dataset.theme = "dark";
  }
}

// ---- 请求封装 ----
async function openDice(title, expr) {
  await request("open-dice", { title, expr, tokenId });
}

async function setValue(field, sub, value) {
  const res = await request("set-value", { cardId, field, sub, value });
  if (!res.ok) {
    try {
      await OBR.notification.show("保存失败：" + res.error, "ERROR");
    } catch (e) { /* 忽略 */ }
  }
}

// ---- 渲染 ----
function render() {
  const d = card.data;
  const attrs = ATTR_ORDER.map((key) => {
    const a = d.attributes[key];
    const tags = [];
    if (a.proficient) tags.push("★");
    if (a.spellcasting) tags.push("✦");
    return `
      <div class="attr ${a.proficient ? "proficient" : ""}" data-roll="attr" data-key="${key}">
        <div class="attr-name">${ATTR_NAMES[key]}</div>
        <div class="attr-value">${a.value > 0 ? "+" + a.value : a.value}</div>
        <div class="attr-tags">${tags.join(" ")}</div>
      </div>`;
  }).join("");

  const boxes = (field, current, max, cls, label) => {
    let html = "";
    for (let i = 0; i < max; i++) {
      html += `<div class="box ${i < current ? "filled" : ""}" data-box="${field}" data-i="${i}"></div>`;
    }
    return `
      <div class="stat-row">
        <div class="stat-label">${label}</div>
        <div class="stat-value">${current}/${max}</div>
        <div class="grow"><div class="box-grid ${cls}">${html}</div></div>
      </div>`;
  };

  const weapons = d.weapons.length
    ? d.weapons.map((w, wi) => {
        const atk = weaponAttack(w, d);
        const dmg = weaponDamage(w, d);
        const atkTitle = w.name + "·命中" + (atk.attrName ? "(" + atk.attrName + ")" : "");
        return `
          <div class="weapon">
            <div class="weapon-head">
              <span>${esc(w.name)}</span>
              <span class="weapon-trait">${esc(w.slot)}${w.trait ? " · " + esc(w.trait) : ""}</span>
            </div>
            <div class="weapon-rolls">
              <div class="roll-btn" data-roll="atk" data-i="${wi}" title="${esc(atkTitle)}">⚔ 命中 ${esc(atk.expression)}</div>
              <div class="roll-btn damage" data-roll="dmg" data-i="${wi}" title="${esc(w.name + "·伤害")}">🗡 伤害 ${esc(dmg.expression)}</div>
            </div>
            ${w.feature ? `<div class="weapon-feature">${mdLite(w.feature)}</div>` : ""}
          </div>`;
      }).join("")
    : `<div class="muted center">未装备武器</div>`;

  const classCardsHtml = d.classCards.map((c) => `
      <div class="domain-card">
        <div class="d-head">
          <span>${esc(c.name)}</span>
          <span class="d-meta">${esc(CARD_TYPE_NAMES[c.type] || c.type || "")}${c.level ? " · LV" + esc(c.level) : ""}</span>
        </div>
        ${c.description ? `<div class="d-desc">${mdLite(c.description)}</div>` : ""}
      </div>`).join("");

  const profSpecial = d.professionSpecial
    ? `<div class="domain-card">
        <div class="d-head"><span>职业技能</span></div>
        ${d.professionSpecial["希望特性"] ? `<div class="d-desc"><b>希望特性：</b>${mdLite(d.professionSpecial["希望特性"])}</div>` : ""}
        ${d.professionSpecial["起始生命"] ? `<div class="d-desc">起始生命：${esc(d.professionSpecial["起始生命"])}</div>` : ""}
        ${d.professionSpecial["起始闪避"] ? `<div class="d-desc">起始闪避：${esc(d.professionSpecial["起始闪避"])}</div>` : ""}
        ${d.professionSpecial["起始物品"] ? `<div class="d-desc">起始物品：${esc(d.professionSpecial["起始物品"])}</div>` : ""}
      </div>`
    : "";

  const domainCardsHtml = d.domainCards.map((c) => `
      <div class="domain-card">
        <div class="d-head">
          <span>${esc(c.name)}</span>
          <span class="d-meta">${esc(c.class || "")}${c.level ? " · LV" + esc(c.level) : ""}</span>
        </div>
        ${c.description ? `<div class="d-desc">${mdLite(c.description)}</div>` : ""}
      </div>`).join("") || `<div class="muted center">暂无领域卡</div>`;

  const expHtml = d.experiences.map((e) => `
      <div class="row-between" style="padding:3px 0">
        <span>${esc(e.name)}</span>
        <span class="muted">+${esc(e.value)}</span>
      </div>`).join("") || `<div class="muted center">暂无经历</div>`;

  const itemsHtml = d.items.length
    ? d.items.map((it) => `<div style="padding:3px 0">· ${esc(it)}</div>`).join("")
    : `<div class="muted center">空</div>`;

  const infoTags = [];
  if (d.ancestries.length) infoTags.push(...d.ancestries);
  if (d.community) infoTags.push(d.community);
  if (d.subclass) infoTags.push(d.subclass);

  const section = (key, title, body) => {
    const isOpen = openSections.has(key);
    return `
      <div class="section ${isOpen ? "open" : ""}" data-sec="${key}">
        <div class="section-title" data-toggle="${key}">
          <span>${title}</span>
          <span class="arrow">▶</span>
        </div>
        ${isOpen ? `<div class="section-body">${body}</div>` : ""}
      </div>`;
  };

  app.innerHTML = `
    <div class="panel">
      <div class="app-header">
        <div class="avatar">${esc((d.name || "?").slice(0, 1))}</div>
        <div class="grow">
          <div style="font-weight:800;font-size:16px">${esc(d.name)}</div>
          <div class="muted">LV${esc(d.level)} · ${esc(d.profession || "")} · 熟练值 ${d.proficiencyValue}</div>
        </div>
        <button class="btn btn-sm" id="btn-close" title="关闭">✕</button>
      </div>

      ${section("basic", "属性与战斗数值", `
        <div class="attr-grid">${attrs}</div>
        <div style="margin-top:8px">
          <div class="stat-row">
            <div class="stat-label">闪避</div>
            <div class="stat-value">${esc(d.evasion)}</div>
            <div class="stat-label" style="min-width:auto">伤害阈值</div>
            <div class="stat-value" style="font-size:13px">${esc(d.thresholds.minor)} / ${esc(d.thresholds.major)}</div>
            <div class="muted grow" title="轻微阈值 / 严重阈值">轻/重</div>
          </div>
        </div>
        ${boxes("hp", d.hp.current, d.hp.max, "hp", "生命值")}
        ${boxes("stress", d.stress.current, d.stress.max, "stress", "压力值")}
        <div class="stat-row">
          <div class="stat-label">希望值</div>
          <button class="btn btn-icon" data-hope="-1">−</button>
          <div class="stat-value">${d.hope.current}/${d.hope.max}</div>
          <button class="btn btn-icon" data-hope="1">＋</button>
          <div class="grow"></div>
        </div>
        ${boxes("armor", d.armor.current, d.armor.max, "armor", "护甲槽")}
        ${boxes("gold", d.gold.current, d.gold.max, "gold", "金币")}
        <div class="center" style="margin-top:8px">
          <button class="btn btn-primary btn-block" id="btn-free">🎲 自由投骰（2d12）</button>
        </div>
      `)}

      ${section("weapons", "武器（" + d.weapons.length + "）", weapons)}

      ${section("class", "职业与身份", profSpecial + classCardsHtml + `
        <div class="d-desc" style="margin-top:8px">
          ${infoTags.length ? "标签：" + infoTags.map((t) => "「" + esc(t) + "」").join(" ") : ""}
        </div>
      `)}

      ${section("domain", "领域卡（" + d.domainCards.length + "）", domainCardsHtml)}

      ${section("exp", "人物经历", expHtml)}

      ${section("items", "背包", itemsHtml)}

      ${section("story", "背景故事", `
        ${d.background ? mdLite(d.background) : '<span class="muted">（无）</span>'}
        ${d.appearance ? `<div style="margin-top:8px"><b>外貌：</b>${mdLite(d.appearance)}</div>` : ""}
        ${d.motivation ? `<div style="margin-top:8px"><b>动机：</b>${mdLite(d.motivation)}</div>` : ""}
      `)}
    </div>`;

  bindEvents();
}

function bindEvents() {
  app.querySelectorAll("[data-toggle]").forEach((el) => {
    el.addEventListener("click", () => {
      const key = el.dataset.toggle;
      if (openSections.has(key)) openSections.delete(key);
      else openSections.add(key);
      render();
    });
  });

  app.querySelectorAll("[data-roll='attr']").forEach((el) => {
    el.addEventListener("click", () => {
      const key = el.dataset.key;
      const a = card.data.attributes[key];
      const title = ATTR_NAMES[key] + "检定";
      const expr = "2d12" + (a.value > 0 ? "+" + a.value : a.value < 0 ? a.value : "");
      openDice(title, expr);
    });
  });

  app.querySelectorAll("[data-roll='atk']").forEach((el) => {
    el.addEventListener("click", () => {
      const w = card.data.weapons[Number(el.dataset.i)];
      const atk = weaponAttack(w, card.data);
      openDice(w.name + "·命中", atk.expression);
    });
  });

  app.querySelectorAll("[data-roll='dmg']").forEach((el) => {
    el.addEventListener("click", () => {
      const w = card.data.weapons[Number(el.dataset.i)];
      const dmg = weaponDamage(w, card.data);
      openDice(w.name + "·伤害", dmg.expression);
    });
  });

  app.querySelectorAll("[data-box]").forEach((el) => {
    el.addEventListener("click", () => {
      const field = el.dataset.box;
      const i = Number(el.dataset.i);
      const cur = card.data[field].current;
      const next = i + 1 === cur ? cur - 1 : i + 1;
      setValue(field, "current", Math.max(0, next));
    });
  });

  app.querySelectorAll("[data-hope]").forEach((el) => {
    el.addEventListener("click", () => {
      const delta = Number(el.dataset.hope);
      const next = Math.max(0, Math.min(card.data.hope.max, card.data.hope.current + delta));
      setValue("hope", "current", next);
    });
  });

  const btnClose = document.getElementById("btn-close");
  if (btnClose) btnClose.addEventListener("click", () => OBR.popover.close("dh-card"));

  const btnFree = document.getElementById("btn-free");
  if (btnFree) btnFree.addEventListener("click", () => openDice("自由投骰", "2d12"));
}

// ---- 数据加载 ----
async function loadCard() {
  const res = await request("get-card", { cardId });
  if (!res.ok || !res.data) {
    app.innerHTML = `<div class="panel"><div class="center muted">这张车卡已被删除。</div></div>`;
    return false;
  }
  card = res.data;
  lastSig = JSON.stringify(card.data);
  render();
  return true;
}

// ---- 启动 ----
OBR.onReady(async () => {
  await applyTheme();
  OBR.theme.onChange((t) => {
    document.body.dataset.theme = t && t.mode === "LIGHT" ? "light" : "dark";
  });
  const ok = await loadCard();
  if (!ok) return;
  // 房间数据变化（自己或别人改了数值）时自动刷新
  try {
    OBR.room.onMetadataChange(async () => {
      const res = await request("get-card", { cardId });
      if (!res.ok || !res.data) {
        app.innerHTML = `<div class="panel"><div class="center muted">这张车卡已被删除。</div></div>`;
        return;
      }
      const sig = JSON.stringify(res.data.data);
      if (sig !== lastSig) {
        card = res.data;
        lastSig = sig;
        render();
      }
    });
  } catch (e) {
    /* 忽略 */
  }
});
