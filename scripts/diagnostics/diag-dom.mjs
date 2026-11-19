/** Inspect /data-register against a running server: login, measure column widths. */
const base = process.argv[2] || "http://127.0.0.1:4311";
const width = Number(process.argv[3] || 1440);

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

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: base + "/login" });
await new Promise(r => setTimeout(r, 3000));
await evalx(`fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "test", password: "test" }) }).then(r => r.status)`);
await send("Page.navigate", { url: base + "/data-register" });
await new Promise(r => setTimeout(r, 6000));

const out = await evalx(`(() => {
  const table = document.querySelector(".register-table");
  return JSON.stringify({
    viewport: innerWidth,
    rendered: !!document.querySelector(".main-area"),
    headers: Array.from(document.querySelectorAll(".register-table thead th")).map(t => (t.innerText.trim() || "(filler)") + "=" + Math.round(t.getBoundingClientRect().width)),
    tableWidth: Math.round(table?.getBoundingClientRect().width || 0),
    wrapWidth: Math.round((document.querySelector(".register-table-wrap")?.getBoundingClientRect().width) || 0),
    horizScroll: (() => { const w = document.querySelector(".register-table-wrap"); return w ? w.scrollWidth > w.clientWidth : null; })()
  });
})()`);
console.log(out);
ws.close();
process.exit(0);
