/** Diagnose /data-register render state: URL, body text, column widths. */
const base = process.argv[2] || "http://127.0.0.1:3000";

const created = await (await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

let id = 0;
const pending = new Map();
const events = new Map();
ws.addEventListener("message", event => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.method + " " + JSON.stringify(msg.error))) : resolve(msg.result);
  } else if (msg.method) {
    const waiters = events.get(msg.method);
    if (waiters) { events.delete(msg.method); waiters.forEach(fn => fn(msg.params)); }
  }
});
function send(method, params = {}) {
  const messageId = ++id;
  return new Promise((resolve, reject) => {
    pending.set(messageId, { resolve, reject });
    ws.send(JSON.stringify({ id: messageId, method, params }));
  });
}
function once(method, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout " + method)), timeout);
    const fn = params => { clearTimeout(timer); resolve(params); };
    events.set(method, [...(events.get(method) || []), fn]);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + " " + (result.exceptionDetails.exception?.description || ""));
  return result.result.value;
}

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

const loaded = once("Page.loadEventFired");
await send("Page.navigate", { url: base + "/data-register" });
await loaded.catch(() => {});
await sleep(4000);

const state = await evaluate(`(() => ({
  url: location.href,
  title: document.title,
  heading: document.querySelector("h1")?.innerText || "",
  bodyStart: document.body.innerText.slice(0, 300),
  hasTable: !!document.querySelector(".register-table"),
  cols: Array.from(document.querySelectorAll(".register-table col")).map(c => Math.round(c.getBoundingClientRect().width)),
  headers: Array.from(document.querySelectorAll(".register-table thead th")).map(t => t.innerText.trim() + "=" + Math.round(t.getBoundingClientRect().width)),
  tableWidth: Math.round((document.querySelector(".register-table")?.getBoundingClientRect().width) || 0),
  wrapWidth: Math.round((document.querySelector(".register-table-wrap")?.getBoundingClientRect().width) || 0)
}))()`);
console.log(JSON.stringify(state, null, 2));
ws.close();
process.exit(0);
