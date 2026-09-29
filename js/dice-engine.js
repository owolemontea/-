// ============================================================
// 骰子引擎（纯逻辑，不依赖任何外部库）
// 支持表达式：
//   "2d12+3"         匕首之心核心判定（2d12 双色骰 + 属性值）
//   "3d10+6"         武器伤害（熟练值颗伤害骰 + 武器自带加值）
//   "2d12+3+1d6"     带优势（优势 = 总结果 +1d6）
//   "2d12+3-1d6"     带劣势（劣势 = 总结果 -1d6）
//   "d6"             省略数量 = 1 颗
// 中文标点自动识别：（ ） ， 、 ＋ － —
// ============================================================

/** 中文标点 / 空白归一化为 ASCII */
export function normalizeExpr(s) {
  return String(s == null ? "" : s)
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[，、]/g, ",")
    .replace(/[；]/g, ";")
    .replace(/[＋]/g, "+")
    .replace(/[－—]/g, "-")
    .replace(/[×]/g, "*")
    .replace(/\s+/g, "");
}

/** 投一颗 n 面骰，返回 1..n */
export function rollDie(sides) {
  const n = Math.max(1, Math.floor(Number(sides) || 6));
  return Math.floor(Math.random() * n) + 1;
}

/**
 * 把表达式字符串解析成 { segments:[{count,sides,sign}], flat }
 * segments: 骰子段（sign 为 +1 或 -1）
 * flat:     固定加值（如 +3、-1）
 */
export function parseExpression(expr) {
  const segments = [];
  let flat = 0;
  if (expr === null || expr === undefined || expr === "") {
    return { segments, flat };
  }
  const s = normalizeExpr(expr);
  const re = /([+-]?)(\d*)d(\d+)|([+-]?\d+)/gi;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m[3] !== undefined) {
      // 匹配到 "2d12" 这类骰子段
      const count = m[2] === "" ? 1 : parseInt(m[2], 10);
      const sides = parseInt(m[3], 10);
      const sign = m[1] === "-" ? -1 : 1;
      if (count > 0 && sides > 0) {
        segments.push({ count, sides, sign });
      }
    } else if (m[4] !== undefined) {
      // 匹配到纯数字加值
      flat += parseInt(m[4], 10);
    }
  }
  return { segments, flat };
}

/** 把骰段 + 固定值拼回表达式字符串 */
export function formatExpression(segments, flat) {
  let s = "";
  segments.forEach((seg, i) => {
    const part = seg.count + "d" + seg.sides;
    if (i === 0) {
      s += seg.sign < 0 ? "-" + part : part;
    } else {
      s += (seg.sign < 0 ? "-" : "+") + part;
    }
  });
  if (flat !== 0) {
    s += flat > 0 ? "+" + flat : String(flat);
  }
  return s === "" ? "0" : s;
}

/**
 * 应用优势/劣势（匕首之心规则）
 * mode: "normal" | "adv" | "dis"
 * 优势 = 追加 +1d6；劣势 = 追加 -1d6
 * 返回新的 { segments, flat }
 */
export function applyMode(segments, flat, mode) {
  const segs = segments.map((s) => ({ ...s }));
  if (mode === "adv") segs.push({ count: 1, sides: 6, sign: 1 });
  if (mode === "dis") segs.push({ count: 1, sides: 6, sign: -1 });
  return { segments: segs, flat };
}

/**
 * 投掷整组骰子
 * 返回 {
 *   total,                       // 最终总值
 *   groups: [{label, values, sum, sign, sides, hopePair}],
 *                                // 每组骰子的明细（hopePair=这组是希望/恐惧组）
 *   flat,                        // 固定加值
 *   hopeDie, fearDie,            // 匕首之心：第一组 2d12 的希望骰/恐惧骰
 *   expression                   // 拼好的表达式
 * }
 */
export function rollSegments(segments, flat) {
  const groups = [];
  let total = 0;
  let hopeDie = null;
  let fearDie = null;
  let hopeTaken = false;
  for (const seg of segments) {
    const values = [];
    for (let i = 0; i < seg.count; i++) values.push(rollDie(seg.sides));
    const sum = values.reduce((a, b) => a + b, 0);
    total += seg.sign * sum;
    let hopePair = false;
    if (!hopeTaken && seg.count === 2 && seg.sides === 12) {
      hopeDie = values[0];
      fearDie = values[1];
      hopeTaken = true;
      hopePair = true;
    }
    groups.push({
      label: seg.count + "d" + seg.sides,
      values,
      sum,
      sign: seg.sign,
      sides: seg.sides,
      hopePair,
    });
  }
  total += flat;
  return {
    total,
    groups,
    flat,
    hopeDie,
    fearDie,
    expression: formatExpression(segments, flat),
  };
}

/** 结果的一句话描述，如 "2d12+3 → 15（希望5 恐惧7）" */
export function describeRoll(result) {
  let s = result.expression + " → " + result.total;
  if (result.hopeDie !== null && result.fearDie !== null) {
    s += "（希望" + result.hopeDie + " 恐惧" + result.fearDie + "）";
  }
  return s;
}
