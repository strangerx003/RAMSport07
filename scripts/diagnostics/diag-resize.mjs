/** Drive the Excel-style column resize on /data-register via real mouse
  *  events: drag the Description header edge, verify the width changed, then
  *  double-click and verify it restores. */
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
await send("Input.setIgnoreInputEvents", { ignore: false });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: base + "/login" });
await sleep(2500);
await evalx(`fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "test", password: "test" }) }).then(r => r.status)`);
await send("Page.navigate", { url: base + "/data-register" });
await sleep(5000);

const grab = await evalx(`(() => {
  const th = Array.from(document.querySelectorAll(".register-table thead th"))[1]; // Description
  const handle = th.querySelector(".col-resizer");
  const r = handle.getBoundingClientRect();
  return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), width: Math.round(th.getBoundingClientRect().width) });
})()`);
const start = JSON.parse(grab);
console.log("before drag: Description =", start.width, "px ? handle at", start.x, start.y);

// Mouse down on the handle, move +90px, up
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: start.x, y: start.y, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: start.x + 45, y: start.y });
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: start.x + 90, y: start.y });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: start.x + 90, y: start.y, button: "left", clickCount: 1 });
await sleep(600);
const afterDrag = JSON.parse(await evalx(`JSON.stringify({ width: Math.round(document.querySelectorAll(".register-table thead th")[1].getBoundingClientRect().width) })`));
console.log("after +90px drag: Description =", afterDrag.width, "px");
console.log("DRAG", afterDrag.width >= start.width + 85 ? "PASS" : "FAIL");

// Re-locate the handle ? it moved with the widened column
const grab2 = await evalx(`(() => {
  const th = Array.from(document.querySelectorAll(".register-table thead th"))[1];
  const r = th.querySelector(".col-resizer").getBoundingClientRect();
  return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
})()`);
const p2 = JSON.parse(grab2);

// Double-click to reset
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p2.x, y: p2.y, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p2.x, y: p2.y, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p2.x, y: p2.y, button: "left", clickCount: 2 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p2.x, y: p2.y, button: "left", clickCount: 2 });
await sleep(600);
const afterReset = JSON.parse(await evalx(`JSON.stringify({ width: Math.round(document.querySelectorAll(".register-table thead th")[1].getBoundingClientRect().width) })`));
console.log("after double-click reset: Description =", afterReset.width, "px");
console.log("RESET", Math.abs(afterReset.width - start.width) <= 2 ? "PASS" : "FAIL");

ws.close();
process.exit(0);
