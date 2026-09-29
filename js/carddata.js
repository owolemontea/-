// ============================================================
// 车卡解析（纯逻辑，不依赖任何外部库）
// 把「匕首之心角色卡工具」导出的 JSON 转成插件内部好用的结构。
// 熟练值表（规则确认）：
//   1级=1  2-4级=2  5-7级=3  8-10级=4
// ============================================================

/** 六项属性的顺序（与 JSON 里 proficiency 数组顺序一致） */
export const ATTR_ORDER = ["agility", "strength", "finesse", "instinct", "presence", "knowledge"];

/** 属性中文名 */
export const ATTR_NAMES = {
  agility: "敏捷",
  strength: "力量",
  finesse: "灵巧",
  instinct: "直觉",
  presence: "风度",
  knowledge: "知识",
};

/** 中文名 -> 属性键（用于解析武器伤害里写的属性名） */
export const ATTR_KEYS_BY_NAME = {
  敏捷: "agility",
  力量: "strength",
  灵巧: "finesse",
  直觉: "instinct",
  风度: "presence",
  知识: "knowledge",
};

/** 等级 -> 熟练值 */
export function proficiencyForLevel(level) {
  const lv = Math.max(1, Math.min(10, Math.floor(Number(level) || 1)));
  if (lv <= 1) return 1;
  if (lv <= 4) return 2;
  if (lv <= 7) return 3;
  return 4;
}

/**
 * 解析武器伤害字符串，例如：
 *   "力量: d10+6"  -> { attributeName:"力量", attributeKey:"strength", count:0, sides:10, bonus:6 }
 *   "d6"           -> { count:0, sides:6, bonus:0 }
 *   "2d8+3"        -> { count:2, sides:8, bonus:3 }
 * count 为 0 表示"按熟练值颗数"（匕首之心武器伤害规则）
 */
export function parseDamage(str) {
  if (!str) return null;
  const s = String(str).trim();
  const m = s.match(/^(.*?)\s*[:：]\s*(.+)$/);
  const attrPart = m ? m[1].trim() : "";
  const dicePart = m ? m[2].trim() : s;
  const d = dicePart.match(/^(\d*)d(\d+)\s*([+-]\s*\d+)?$/i);
  if (!d) return null;
  return {
    attributeName: attrPart || null,
    attributeKey: attrPart ? ATTR_KEYS_BY_NAME[attrPart] || null : null,
    count: d[1] === "" ? 0 : parseInt(d[1], 10),
    sides: parseInt(d[2], 10),
    bonus: d[3] ? parseInt(String(d[3]).replace(/\s+/g, ""), 10) : 0,
  };
}

/** 数数组里有几个 true */
function countTrue(arr) {
  return Array.isArray(arr) ? arr.filter(Boolean).length : 0;
}

/**
 * 把工具导出的 JSON 解析成内部车卡结构。
 * 注意：characterImage（头像 base64）不保存，省空间。
 */
export function parseCard(raw) {
  const j = raw || {};
  const level = Math.max(1, Math.floor(Number(j.level) || 1));
  const proficiencyValue = proficiencyForLevel(level);

  // 六项属性
  const attributes = {};
  ATTR_ORDER.forEach((key, i) => {
    const a = j[key] || {};
    attributes[key] = {
      value: Number(a.value) || 0,
      proficient: !!(j.proficiency && j.proficiency[i]),
      spellcasting: !!a.spellcasting,
    };
  });

  // 武器（主武器 / 副武器 / 备用武器）
  const weapons = [];
  const slots = (j.equipment && j.equipment.weaponSlots) || {};
  const pushWeapon = (w, slot) => {
    if (!w || !w.name) return;
    weapons.push({
      slot,
      name: w.name,
      trait: w.trait || "",
      damage: w.damage || "",
      parsed: parseDamage(w.damage),
      feature: w.feature || "",
    });
  };
  pushWeapon(slots.primary, "主武器");
  pushWeapon(slots.secondary, "副武器");
  if (Array.isArray(slots.inventory)) {
    slots.inventory.forEach((w, i) => pushWeapon(w, "备用武器" + (i + 1)));
  }

  // 卡片分类：领域卡单独放，职业/子职业/血脉/社群放一起
  const domainCards = [];
  const classCards = [];
  let professionSpecial = null;
  (Array.isArray(j.cards) ? j.cards : []).forEach((c) => {
    if (!c || !c.name) return;
    if (c.type === "domain") {
      domainCards.push(c);
    } else {
      classCards.push(c);
      if (c.type === "profession" && c.professionSpecial) {
        professionSpecial = c.professionSpecial;
      }
    }
  });

  // 经历（去掉空项）
  const experiences = [];
  (Array.isArray(j.experience) ? j.experience : []).forEach((name, i) => {
    if (name && String(name).trim()) {
      experiences.push({
        name,
        value: (j.experienceValues && j.experienceValues[i]) || "",
      });
    }
  });

  // 职业名（professionRef.name 可能是 "守护者  -  勇气&利刃"，只取前半）
  const professionName = String(
    (j.professionRef && j.professionRef.name) || j.profession || ""
  )
    .split(/\s*[-—]\s*/)[0]
    .trim();

  return {
    id: "dh-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
    name: j.name || "未命名",
    level,
    profession: professionName,
    subclass: (j.subclassRef && j.subclassRef.name) || j.subclass || "",
    ancestries: [j.ancestry1Ref, j.ancestry2Ref]
      .filter(Boolean)
      .map((r) => r.name),
    community: (j.communityRef && j.communityRef.name) || j.community || "",
    evasion: Number(j.evasion) || 0,
    attributes,
    proficiencyValue,
    // 可调整数值
    hp: { current: countTrue(j.hp), max: Number(j.hpMax) || 0 },
    stress: { current: countTrue(j.stress), max: Number(j.stressMax) || 0 },
    hope: { current: Number(j.hope) || 0, max: Number(j.hopeMax) || 0 },
    armor: { current: countTrue(j.armorBoxes), max: Number(j.armorMax) || 0 },
    // 固定数值
    thresholds: {
      minor: Number(j.minorThreshold) || 0,
      major: Number(j.majorThreshold) || 0,
    },
    gold: {
      current: countTrue(j.gold),
      max: Array.isArray(j.gold) ? j.gold.length : 0,
    },
    // 文本资料
    experiences,
    weapons,
    items: (Array.isArray(j.inventory) ? j.inventory : []).filter(
      (s) => s && String(s).trim()
    ),
    background: j.characterBackground || "",
    appearance: j.characterAppearance || "",
    motivation: j.characterMotivation || "",
    professionSpecial,
    domainCards,
    classCards,
  };
}

/** 带符号拼加值：fmtBonus(3)="+3" fmtBonus(-1)="-1" fmtBonus(0)="" */
export function fmtBonus(n) {
  if (!n) return "";
  return n > 0 ? "+" + n : String(n);
}

/**
 * 武器命中表达式：2d12 + 武器对应属性值
 * 例如 力量3 -> "2d12+3"
 */
export function weaponAttack(weapon, card) {
  const key = weapon.parsed && weapon.parsed.attributeKey;
  const attr = key && card.attributes[key] ? card.attributes[key].value : 0;
  const attrName = key ? ATTR_NAMES[key] : weapon.parsed ? weapon.parsed.attributeName : "";
  return {
    expression: "2d12" + fmtBonus(attr),
    attrName: attrName || "",
  };
}

/**
 * 武器伤害表达式：熟练值颗武器伤害骰 + 武器自带加值
 * 例如 熟练值3、武器 d10+6 -> "3d10+6"
 * 如果武器自己写了颗数（如 2d8+3），以武器写的为准
 */
export function weaponDamage(weapon, card) {
  if (!weapon.parsed) return { expression: "2d12" };
  const count = weapon.parsed.count > 0 ? weapon.parsed.count : card.proficiencyValue;
  return {
    expression: count + "d" + weapon.parsed.sides + fmtBonus(weapon.parsed.bonus),
  };
}
