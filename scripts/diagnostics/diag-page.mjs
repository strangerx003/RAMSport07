/** In-page: does fetch resolve? Did React hydrate? What is the shell doing? */
const created = await (await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", rej, { once: true }); });
let id = 0; const pending = new Map();
const exceptions = [];
ws.addEventListener("message", e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") exceptions.push(JSON.stringify(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
});
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalx = async expression => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return "EVAL ERROR: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: "http://127.0.0.1:3000/data-register" });
await new Promise(r => setTimeout(r, 6000));

console.log("1. shell present:", await evalx(`!!document.querySelector(".app-loading-shell")`));
console.log("2. main-area present:", await evalx(`!!document.querySelector(".main-area")`));
console.log("3. in-page fetch session:", await evalx(`fetch("/api/auth/session",{cache:"no-store"}).then(r=>r.status+" "+r.headers.get("content-type")).catch(e=>"ERR "+e.message)`));
console.log("4. react root markers:", await evalx(`JSON.stringify({
  nextData: typeof window.__NEXT_DATA__,
  reactRoots: Object.keys(window).filter(k=>k.toLowerCase().includes("react")).slice(0,5),
  fiber: !!document.querySelector(".app-loading-shell")?.[Object.keys(document.querySelector(".app-loading-shell")||{}).find(k=>k.startsWith("__react"))],
  scripts: Array.from(document.scripts).map(s=>s.src.split("/").pop()).slice(0,8)
})`));
console.log("5. body text now:", await evalx(`document.body.innerText.length`));
console.log("6. exceptions:", exceptions.length ? exceptions : "none");
ws.close();
process.exit(0);
