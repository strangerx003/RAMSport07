/** Confirm the Data Register no longer mounts a header KPI strip. */
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

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: base + "/login" });
await new Promise(r => setTimeout(r, 2500));
await evalx(`fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "test", password: "test" }) }).then(r => r.status)`);
await send("Page.navigate", { url: base + "/data-register" });
await new Promise(r => setTimeout(r, 5000));

console.log(await evalx(`JSON.stringify({
  kpiStrip: !!document.querySelector("#page-kpis [data-kpis], .page-kpis, [aria-label*='headline figures']"),
  headerHasMetrics: !!document.querySelector(".page-header [class*='kpi']"),
  footer: document.querySelector(".register-status")?.innerText.replace(/\\n/g, " | ") || "MISSING",
  table: !!document.querySelector(".register-table"),
  descriptionWidth: Math.round(document.querySelector(".register-table thead th:nth-child(2)")?.getBoundingClientRect().width || 0)
})`));
ws.close();
process.exit(0);
