// ============================================================
// 界面页 -> 后台 通信助手
// 所有弹窗页面都通过 OBR 的本地广播跟 background.js 说话：
//   请求：{ reqId, type, payload }
//   应答：{ reqId, ok, data | error }
// ============================================================
import OBR from "./obr.js";

const CH_REQ = "dh/request";
const CH_RES = "dh/response";

const pending = new Map();
let seq = 0;
let listening = false;

function ensureListening() {
  if (listening) return;
  listening = true;
  OBR.broadcast.onMessage(CH_RES, (event) => {
    const msg = event.data || {};
    const cb = pending.get(msg.reqId);
    if (cb) {
      pending.delete(msg.reqId);
      cb(msg);
    }
  });
}

/**
 * 给后台发请求，返回 Promise
 * @param {string} type   请求类型
 * @param {object} payload 参数
 * @param {number} timeout 超时毫秒
 */
export function request(type, payload = {}, timeout = 10000) {
  ensureListening();
  return new Promise((resolve) => {
    const reqId = "r" + ++seq + "-" + Math.random().toString(36).slice(2, 6);
    pending.set(reqId, resolve);
    OBR.broadcast
      .sendMessage(CH_REQ, { reqId, type, payload }, { destination: "LOCAL" })
      .catch(() => {});
    setTimeout(() => {
      if (pending.has(reqId)) {
        pending.delete(reqId);
        resolve({ ok: false, error: "后台没有响应，请检查插件是否正常加载" });
      }
    }, timeout);
  });
}

/** 弹一个枭熊系统通知 */
export async function notify(message, variant = "INFO") {
  try {
    await OBR.notification.show(message, variant);
  } catch (e) {
    // 通知失败不影响功能
  }
}
