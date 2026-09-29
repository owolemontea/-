// ============================================================
// 插件大脑（后台页面）
// 所有与枭熊的交互都集中在这里：
//   1. 监听自己选中的棋子 -> 弹出/关闭角色卡
//   2. 右键菜单 -> 绑定/解绑车卡
//   3. 处理各界面发来的请求（导入、删除、改数值、投骰……）
//   4. 投骰后在棋子上方显示浮动结果文字（8 秒后消失）
// ============================================================
import OBR from "./obr.js";
import { parseCard } from "./carddata.js";
import { applyMode, rollSegments, describeRoll } from "./dice-engine.js";

// ---- 常量 ----
const CARDS_KEY = "com.daggerheart/cards"; // 房间公共数据里存车卡的键
const BIND_KEY = "com.daggerheart/cardId"; // 棋子元数据上绑定关系的键
const CH_REQ = "dh/request"; // 界面 -> 后台
const CH_RES = "dh/response"; // 后台 -> 界面
const CH_EFFECT = "dh/dice-effect"; // 投骰特效广播（全场播放动画）
const CARD_POP = "dh-card"; // 角色卡弹窗 id
const DICE_POP = "dh-dice"; // 投骰弹窗 id
const BIND_POP = "dh-bind"; // 绑定弹窗 id
const EFFECT_MODAL_PREFIX = "dh-effect-"; // 特效弹窗 id 前缀

// 插件所在的基础地址（用于拼弹窗页面链接，兼容子目录托管）
const BASE = new URL(".", window.location.href).href;

let currentCardPop = null; // { tokenId, cardId } 当前打开的角色卡弹窗
let lastEffectModal = null; // 当前打开的特效弹窗 id（新投骰时先关旧的）

// ---- 小工具 ----
async function notify(message, variant = "INFO") {
  try {
    await OBR.notification.show(message, variant);
  } catch (e) {
    /* 忽略 */
  }
}

// ---- 车卡存取（存在房间公共数据里，全房间共享） ----
async function getCards() {
  const md = await OBR.room.getMetadata();
  const arr = md[CARDS_KEY];
  return Array.isArray(arr) ? arr : [];
}

async function saveCards(cards) {
  await OBR.room.setMetadata({ [CARDS_KEY]: cards });
}

async function getCard(cardId) {
  const cards = await getCards();
  return cards.find((c) => c.id === cardId) || null;
}

// ---- 棋子操作 ----
async function getToken(tokenId) {
  const items = await OBR.scene.items.getItems([tokenId]);
  return items[0] || null;
}

async function bindCard(tokenId, cardId) {
  const token = await getToken(tokenId);
  if (!token) return { ok: false, error: "找不到棋子" };
  await OBR.scene.items.updateItems([token], (draft) => {
    draft[0].metadata[BIND_KEY] = cardId;
  });
  return { ok: true };
}

async function unbindCard(tokenId) {
  const token = await getToken(tokenId);
  if (!token) return { ok: false, error: "找不到棋子" };
  await OBR.scene.items.updateItems([token], (draft) => {
    delete draft[0].metadata[BIND_KEY];
  });
  return { ok: true };
}

async function getTokenBinding(tokenId) {
  const token = await getToken(tokenId);
  if (!token || !token.metadata[BIND_KEY]) return null;
  return token.metadata[BIND_KEY];
}

// ---- 角色卡弹窗 ----
async function closeCardPopover() {
  if (currentCardPop) {
    currentCardPop = null;
    try {
      await OBR.popover.close(CARD_POP);
    } catch (e) {
      /* 已关闭 */
    }
  }
}

async function handleSelection(selection) {
  const sel = Array.isArray(selection) ? selection : [];
  // 只选中恰好 1 个棋子时才弹卡
  if (sel.length !== 1) {
    await closeCardPopover();
    return;
  }
  const tokenId = sel[0];
  const cardId = await getTokenBinding(tokenId);
  if (!cardId) {
    await closeCardPopover();
    return;
  }
  const card = await getCard(cardId);
  if (!card) return;

  // 同样的棋子+同样的卡已经开着就不用重开（避免闪烁）
  if (currentCardPop && currentCardPop.tokenId === tokenId && currentCardPop.cardId === cardId) {
    return;
  }
  // 换绑了别的棋子/别的卡：先关掉旧的再开新的，保证内容正确
  if (currentCardPop) {
    try {
      await OBR.popover.close(CARD_POP);
    } catch (e) {
      /* 已关闭 */
    }
  }
  currentCardPop = { tokenId, cardId };
  const url = BASE + "card.html?cardId=" + encodeURIComponent(cardId) + "&tokenId=" + encodeURIComponent(tokenId);
  try {
    await OBR.popover.open({
      id: CARD_POP,
      url,
      width: 400,
      height: 640,
      anchorElementId: tokenId,
      anchorOrigin: { horizontal: "CENTER", vertical: "BOTTOM" },
      transformOrigin: { horizontal: "CENTER", vertical: "TOP" },
      marginThreshold: 20,
    });
  } catch (e) {
    currentCardPop = null;
  }
}

// ---- 投骰 + 特效 + 浮动结果文字 ----

/** 打开全场骰子特效弹窗（全屏、点击穿透、自动关闭） */
async function openEffectModal(payload) {
  if (!payload || !payload.rollId) return;
  const url =
    BASE + "effect.html" +
    "?rollId=" + encodeURIComponent(payload.rollId) +
    "&label=" + encodeURIComponent(payload.label || "") +
    "&color=" + encodeURIComponent(payload.color || "") +
    "&total=" + encodeURIComponent(payload.total) +
    "&expr=" + encodeURIComponent(payload.expr || "") +
    "&hope=" + encodeURIComponent(payload.hopeDie == null ? "" : payload.hopeDie) +
    "&fear=" + encodeURIComponent(payload.fearDie == null ? "" : payload.fearDie) +
    "&dice=" + encodeURIComponent(JSON.stringify(payload.dice || []));
  try {
    // 新的一投先关掉上一投的特效，避免叠加
    if (lastEffectModal) {
      try {
        await OBR.modal.close(lastEffectModal);
      } catch (e) {
        /* 已关闭 */
      }
    }
    lastEffectModal = EFFECT_MODAL_PREFIX + payload.rollId;
    await OBR.modal.open({
      id: lastEffectModal,
      url,
      fullScreen: true,
      hideBackdrop: true,
      hidePaper: true,
      disablePointerEvents: true,
    });
  } catch (e) {
    lastEffectModal = null;
    /* 特效打不开不影响结果 */
  }
}

async function doRoll(payload) {
  const { title, segments, flat, mode, tokenId, hidden } = payload || {};
  const applied = applyMode(Array.isArray(segments) ? segments : [], Number(flat) || 0, mode || "normal");
  const result = rollSegments(applied.segments, applied.flat);

  let playerName = "";
  let playerColor = "#b79aff";
  try {
    playerName = (await OBR.player.getName()) || "";
    playerColor = (await OBR.player.getColor()) || "#b79aff";
  } catch (e) {
    /* 忽略 */
  }
  const label = (playerName ? playerName + " " : "") + (title || "投骰");
  const rollId = "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // 拼出每颗骰子的信息（供特效页播放动画）
  const dice = [];
  const modeDie = mode === "adv" || mode === "dis";
  result.groups.forEach((g, gi) => {
    g.values.forEach((v, vi) => {
      const die = { sides: g.sides, value: v, sign: g.sign };
      if (g.hopePair) {
        die.kind = vi === 0 ? "hope" : "fear";
      } else if (modeDie && gi === result.groups.length - 1) {
        die.kind = mode === "adv" ? "adv" : "sub";
      } else if (g.sign < 0) {
        die.kind = "sub";
      }
      dice.push(die);
    });
  });

  const effectPayload = {
    rollId,
    label,
    color: playerColor,
    total: result.total,
    expr: result.expression,
    hopeDie: result.hopeDie,
    fearDie: result.fearDie,
    dice,
  };

  if (!hidden) {
    // 明骰：广播给其他客户端（各自播放特效），自己这边也播
    OBR.broadcast
      .sendMessage(CH_EFFECT, effectPayload, { destination: "REMOTE" })
      .catch(() => {});
    await openEffectModal(effectPayload);

    // 在棋子上方放一段浮动文字，8 秒后自动删除（全场可见）
    await spawnFloatingText(label + "：" + describeRoll(result), tokenId);
  } else {
    // 暗骰：只有自己看到特效，不放场景浮动文字
    await openEffectModal(effectPayload);
  }

  return { ok: true, data: { result, title, playerName, hidden: !!hidden } };
}

/** 在棋子上方放一段浮动文字，8 秒后自动删除 */
async function spawnFloatingText(text, tokenId) {
  if (!tokenId) return;
  try {
    const token = await getToken(tokenId);
    if (!token) return;
    const item = {
      id: "dh-roll-" + Date.now().toString(36),
      type: "TEXT",
      name: "投骰结果",
      position: { x: token.position.x, y: token.position.y - 90 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      visible: true,
      locked: true,
      layer: "TEXT",
      disableHit: true,
      text: {
        type: "PLAIN",
        plainText: text,
        richText: [{ type: "paragraph", children: [{ text }] }],
        style: {
          fillColor: "#ffffff",
          fillOpacity: 1,
          strokeColor: "#1a1a2e",
          strokeOpacity: 0.9,
          strokeWidth: 3,
          textAlign: "CENTER",
          textAlignVertical: "MIDDLE",
          fontFamily: "'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
          fontSize: 26,
          fontWeight: 600,
          lineHeight: 1.25,
          padding: 10,
        },
        width: "AUTO",
        height: "AUTO",
      },
      metadata: {},
    };
    await OBR.scene.items.addItems([item]);
    const itemId = item.id;
    setTimeout(async () => {
      try {
        await OBR.scene.items.deleteItems([itemId]);
      } catch (e) {
        /* 可能已被删除 */
      }
    }, 8000);
  } catch (e) {
    // 没有权限放文字时退而求其次：发个通知
    await notify(text, "SUCCESS");
  }
}

// ---- 请求分发 ----
async function handleRequest(msg) {
  const { reqId, type, payload } = msg || {};
  try {
    let result;
    switch (type) {
      case "get-cards": {
        result = { ok: true, data: await getCards() };
        break;
      }
      case "get-card": {
        result = { ok: true, data: await getCard(payload.cardId) };
        break;
      }
      case "get-selected": {
        const sel = await OBR.player.getSelection();
        result = { ok: true, data: sel && sel.length === 1 ? sel[0] : null };
        break;
      }
      case "get-binding": {
        result = { ok: true, data: await getTokenBinding(payload.tokenId) };
        break;
      }
      case "import-card": {
        const card = parseCard(payload.json);
        const cards = await getCards();
        cards.push({
          id: card.id,
          name: card.name,
          level: card.level,
          profession: card.profession,
          importedAt: Date.now(),
          data: card,
        });
        await saveCards(cards);
        result = { ok: true, data: card };
        break;
      }
      case "delete-card": {
        let cards = await getCards();
        cards = cards.filter((c) => c.id !== payload.cardId);
        await saveCards(cards);
        result = { ok: true };
        break;
      }
      case "bind": {
        result = await bindCard(payload.tokenId, payload.cardId);
        break;
      }
      case "unbind": {
        result = await unbindCard(payload.tokenId);
        break;
      }
      case "set-value": {
        // 调整可动数值（生命/压力/希望/护甲/金币）
        const cards = await getCards();
        const card = cards.find((c) => c.id === payload.cardId);
        if (!card) {
          result = { ok: false, error: "找不到车卡" };
          break;
        }
        if (payload.sub) {
          card.data[payload.field][payload.sub] = payload.value;
        } else {
          card.data[payload.field] = payload.value;
        }
        await saveCards(cards);
        result = { ok: true };
        break;
      }
      case "roll": {
        result = await doRoll(payload);
        break;
      }
      case "open-dice": {
        // 打开投骰弹窗（带默认骰子）
        const url =
          BASE + "dice.html" +
          "?title=" + encodeURIComponent(payload.title || "投骰") +
          "&expr=" + encodeURIComponent(payload.expr || "2d12") +
          "&tokenId=" + encodeURIComponent(payload.tokenId || "");
        try {
          await OBR.popover.close(DICE_POP);
        } catch (e) {
          /* 尚未打开 */
        }
        await OBR.popover.open({
          id: DICE_POP,
          url,
          width: 380,
          height: 560,
          anchorElementId: payload.tokenId || undefined,
          anchorOrigin: { horizontal: "CENTER", vertical: "TOP" },
          transformOrigin: { horizontal: "CENTER", vertical: "BOTTOM" },
          marginThreshold: 20,
        });
        result = { ok: true };
        break;
      }
      case "open-bind": {
        // 打开绑定弹窗
        const url = BASE + "bind.html?tokenId=" + encodeURIComponent(payload.tokenId || "");
        try {
          await OBR.popover.close(BIND_POP);
        } catch (e) {
          /* 尚未打开 */
        }
        await OBR.popover.open({
          id: BIND_POP,
          url,
          width: 340,
          height: 480,
          anchorElementId: payload.tokenId || undefined,
          anchorOrigin: { horizontal: "CENTER", vertical: "BOTTOM" },
          transformOrigin: { horizontal: "CENTER", vertical: "TOP" },
          marginThreshold: 20,
        });
        result = { ok: true };
        break;
      }
      default:
        result = { ok: false, error: "未知请求：" + type };
    }
    await OBR.broadcast.sendMessage(CH_RES, { reqId, ...result }, { destination: "LOCAL" });
  } catch (err) {
    await OBR.broadcast.sendMessage(
      CH_RES,
      { reqId, ok: false, error: String((err && err.message) || err) },
      { destination: "LOCAL" }
    );
  }
}

// ---- 右键菜单 ----
async function setupContextMenu() {
  try {
    await OBR.contextMenu.create({
      id: "dh/bind",
      icons: [
        {
          icon: BASE + "icon.svg",
          label: "匕首之心：绑定车卡",
          filter: {
            max: 1,
            every: [{ key: "type", value: "IMAGE", operator: "=" }],
          },
        },
      ],
      onClick: (context) => {
        const items = context.items || [];
        if (items.length === 0) return;
        handleRequest({ reqId: "ctx-" + Date.now(), type: "open-bind", payload: { tokenId: items[0].id } });
      },
    });
  } catch (e) {
    /* 右键菜单创建失败不影响主功能 */
  }
}

// ---- 启动 ----
OBR.onReady(async () => {
  const myId = OBR.player.id;

  // 监听自己的选中变化 -> 管理角色卡弹窗
  OBR.player.onChange((player) => {
    if (player.id === myId) {
      handleSelection(player.selection);
    }
  });

  // 监听界面发来的请求
  OBR.broadcast.onMessage(CH_REQ, (event) => {
    handleRequest(event.data);
  });

  // 收到别人投骰的特效广播 -> 本客户端也播放动画
  OBR.broadcast.onMessage(CH_EFFECT, (event) => {
    openEffectModal(event.data);
  });

  await setupContextMenu();
});
