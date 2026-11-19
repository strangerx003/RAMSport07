/** Trace dblclick delivery to the resize handle. */
const base = process.argv[2] || "http://127.0.0.1:4311";
const created = await (await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", rej, { once: true }); });
let id = 0; const pending = new Map();
ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalx = async expression => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: base + "/login" });
await sleep(2500);
await evalx(`fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "test", password: "test" }) }).then(r => r.status)`);
await send("Page.navigate", { url: base + "/data-register" });
await sleep(5000);

await evalx(`(() => {
  window.__ev = [];
  const th = document.querySelectorAll(".register-table thead th")[1];
  const handle = th.querySelector(".col-resizer");
  ["mousedown","click","dblclick"].forEach(type => handle.addEventListener(type, e => window.__ev.push(type + "(" + e.detail + ")")));
  document.addEventListener("dblclick", e => window.__ev.push("doc-dblclick target=" + (e.target.className || e.target.tagName)), true);
})()`);

const pt = await evalx(`(() => {
  const handle = document.querySelectorAll(".register-table thead th")[1].querySelector(".col-resizer");
  const r = handle.getBoundingClientRect();
  return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
})()`);
const p = JSON.parse(pt);

await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 2 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 2 });
await sleep(500);

console.log("events:", await evalx(`JSON.stringify(window.__ev)`));
console.log("width:", await evalx(`Math.round(document.querySelectorAll(".register-table thead th")[1].getBoundingClientRect().width)`));
ws.close();
process.exit(0);
