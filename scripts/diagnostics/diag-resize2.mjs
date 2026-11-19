/** What element sits at the resize-handle point, and does mousedown fire? */
const base = process.argv[2] || "http://127.0.0.1:4311";
const created = await (await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", rej, { once: true }); });
let id = 0; const pending = new Map();
const logs = [];
ws.addEventListener("message", e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  if (m.method === "Runtime.consoleAPICalled") logs.push((m.params.args || []).map(a => a.value ?? a.description).join(" "));
});
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

// Instrument the handle with native listeners to see whether events arrive
await evalx(`(() => {
  const handle = document.querySelectorAll(".register-table thead th")[1]?.querySelector(".col-resizer");
  if (!handle) return "NO HANDLE";
  window.__hits = [];
  handle.addEventListener("mousedown", () => window.__hits.push("mousedown"));
  document.addEventListener("mousemove", e => { if (window.__hits.length && !window.__hits.includes("move:" + e.clientX)) window.__hits.push("move:" + e.clientX); }, true);
  document.addEventListener("mouseup", () => window.__hits.push("mouseup"), true);
  return "instrumented";
})()`);

const pt = await evalx(`(() => {
  const th = document.querySelectorAll(".register-table thead th")[1];
  const handle = th.querySelector(".col-resizer");
  const r = handle.getBoundingClientRect();
  const el = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
  return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), elementAtPoint: el ? el.tagName + "." + (el.className || "") : "none" });
})()`);
console.log("point:", pt);
const p = JSON.parse(pt);

await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x + 60, y: p.y, buttons: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x + 120, y: p.y, buttons: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x + 120, y: p.y, button: "left", clickCount: 1 });
await sleep(400);

console.log("native hits:", await evalx(`JSON.stringify(window.__hits || [])`));
console.log("width after:", await evalx(`Math.round(document.querySelectorAll(".register-table thead th")[1].getBoundingClientRect().width)`));
console.log("console:", logs.slice(0, 6));
ws.close();
process.exit(0);
