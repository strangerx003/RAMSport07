/** Capture console errors + network failures on /data-register. */
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
const logs = [];
ws.addEventListener("message", event => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.method + " " + JSON.stringify(msg.error))) : resolve(msg.result);
  } else if (msg.method) {
    if (msg.method === "Runtime.consoleAPICalled") {
      const args = (msg.params.args || []).map(a => a.value ?? a.description ?? JSON.stringify(a.preview?.properties || [])).join(" ");
      logs.push(`[console.${msg.params.type}] ${args}`);
    } else if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      logs.push(`[EXCEPTION] ${d.text} ${d.exception?.description || ""}`);
    } else if (msg.method === "Network.loadingFailed") {
      logs.push(`[NET FAIL] ${msg.params.errorText} ${msg.params.type}`);
    } else if (msg.method === "Network.responseReceived" && msg.params.response.status >= 400) {
      logs.push(`[HTTP ${msg.params.response.status}] ${msg.params.response.url}`);
    }
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

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

const loaded = once("Page.loadEventFired");
await send("Page.navigate", { url: base + "/data-register" });
await loaded.catch(() => {});
await sleep(8000);

console.log("--- logs ---");
logs.forEach(l => console.log(l));
console.log("--- end ---");
const bodyLen = await send("Runtime.evaluate", { expression: "document.body.innerText.length", returnByValue: true });
console.log("body text length:", bodyLen.result.value);
ws.close();
process.exit(0);
