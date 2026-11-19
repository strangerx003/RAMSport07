/** Verify clamping: drag far left -> 44px floor; drag far right -> 480px ceiling. */
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

const handlePoint = index => evalx(`(() => { const r = document.querySelectorAll(".register-table thead th")[${index}].querySelector(".col-resizer").getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }); })()`);

// Drag Description far left -> clamped at the 44px floor
const d = JSON.parse(await handlePoint(1));
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: d.x, y: d.y, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: d.x - 400, y: d.y, buttons: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: d.x - 150, y: d.y, button: "left", clickCount: 1 });
await sleep(500);
const narrowed = await evalx(`Math.round(document.querySelectorAll(".register-table thead th")[1].getBoundingClientRect().width)`);
console.log("Description after -150px drag (expect 44 floor):", narrowed);

// Drag Qty far right -> clamped at the 480px ceiling
const q = JSON.parse(await handlePoint(3));
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: q.x, y: q.y, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: q.x + 800, y: q.y, buttons: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: q.x + 800, y: q.y, button: "left", clickCount: 1 });
await sleep(500);
const widened = await evalx(`Math.round(document.querySelectorAll(".register-table thead th")[3].getBoundingClientRect().width)`);
console.log("Qty after +800px drag (expect 480):", widened);

// Horizontal scrollbar appears when columns overflow the module
console.log("horizScroll visible:", await evalx(`(() => { const w = document.querySelector(".register-table-wrap"); return w.scrollWidth > w.clientWidth; })()`));
ws.close();
process.exit(0);
