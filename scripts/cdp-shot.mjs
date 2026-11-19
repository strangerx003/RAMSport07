/**
 * Render the running app at a real desktop viewport with headless Chrome and
 * dump layout metrics + PNG screenshots. Used to check module workbench density
 * (the in-app browser cannot change its viewport).
 *
 *   node scripts/cdp-shot.mjs http://127.0.0.1:4311 1440 900 [routes...]
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const base = process.argv[2] || "http://127.0.0.1:4311";
const width = Number(process.argv[3] || 1440);
const height = Number(process.argv[4] || 900);
const routes = process.argv.slice(5);
const targets = routes.length ? routes : ["/dashboard", "/rbd", "/fta", "/weibull", "/mil-std-217f", "/fmeca", "/lcc-pm", "/lcc-cm", "/spare-parts"];

const outDir = path.resolve("screenshots", `${width}x${height}${process.env.THEME === "dark" ? "-dark" : ""}`);
await mkdir(outDir, { recursive: true });

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

async function go(route) {
  const loaded = once("Page.loadEventFired");
  await send("Page.navigate", { url: base + route });
  await loaded.catch(() => {});
  await sleep(1800);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
// Pin the theme explicitly: reusing a Chrome profile can otherwise leave the
// dark-mode cookie behind and produce a misleading "light" capture.
await send("Network.setCookie", {
  name: "ramsport-theme",
  value: process.env.THEME === "dark" ? "dark" : "light",
  domain: "127.0.0.1",
  path: "/",
});

await go("/login");
await evaluate(`fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "test", password: "test" }) }).then(r => r.status)`);

const report = {};
for (const route of targets) {
  await go(route);
  const metrics = await evaluate(`(() => {
    const pick = selector => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        rows: s.gridTemplateRows,
        cols: s.gridTemplateColumns,
        pad: s.padding,
        radius: s.borderRadius,
        border: s.borderTopWidth,
        bg: s.backgroundColor,
        overflowY: s.overflowY
      };
    };
    return {
      url: location.pathname,
      viewport: [innerWidth, innerHeight],
      scrollHeight: document.documentElement.scrollHeight,
      main: pick(".main-area"),
      header: pick(".page-header"),
      content: pick(".page-content"),
      workbench: pick(".workbench, .weibull-workbench, .mil217f-workbench, .fmeca-workbench, .lcc-pm-workbench, .lcc-cm-workbench, .spares-workbench"),
      workbenchBody: pick(".workbench-body, .weibull-body, .mil217f-body, .fmeca-body"),
      toolbar: pick(".workbench-toolbar, .weibull-toolbar, .mil217f-toolbar, .fmeca-toolbar"),
      library: pick(".component-library"),
      canvas: pick(".workbench-canvas-wrap"),
      inspector: pick(".workbench-inspector"),
      toolbarOverflow: (() => {
        const t = document.querySelector(".workbench-toolbar");
        return t ? { scroll: t.scrollWidth, client: t.clientWidth } : null;
      })(),
      heading: document.querySelector(".page-header h1")?.innerText || ""
    };
  })()`);
  report[route] = metrics;

  const shot = await send("Page.captureScreenshot", { format: "png" });
  const file = path.join(outDir, route.replace(/^\//, "") + ".png");
  await writeFile(file, Buffer.from(shot.data, "base64"));
  console.log(route, JSON.stringify(metrics));
}

await writeFile(path.join(outDir, "metrics.json"), JSON.stringify(report, null, 2));
console.log("saved to", outDir);
ws.close();
process.exit(0);
