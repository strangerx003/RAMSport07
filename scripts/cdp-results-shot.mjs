/**
 * Capture a module after its analysis has run (results strip visible).
 *   node scripts/cdp-results-shot.mjs http://127.0.0.1:4311 1440 900 /rbd
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const base = process.argv[2] || "http://127.0.0.1:4311";
const width = Number(process.argv[3] || 1440);
const height = Number(process.argv[4] || 900);
const routes = process.argv.slice(5);
const targets = routes.length ? routes : ["/rbd", "/fta", "/lcc-pm", "/spare-parts"];
const outDir = path.resolve("screenshots", `results-${width}x${height}`);
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
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  } else if (msg.method) {
    const waiters = events.get(msg.method);
    if (waiters) { events.delete(msg.method); waiters.forEach(fn => fn(msg.params)); }
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const messageId = ++id;
  pending.set(messageId, { resolve, reject });
  ws.send(JSON.stringify({ id: messageId, method, params }));
});
const once = (method, timeout = 30000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("timeout " + method)), timeout);
  const fn = params => { clearTimeout(timer); resolve(params); };
  events.set(method, [...(events.get(method) || []), fn]);
});
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
  await sleep(1600);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
await send("Network.setCookie", { name: "ramsport-theme", value: process.env.THEME === "dark" ? "dark" : "light", domain: "127.0.0.1", path: "/" });
await go("/login");
await evaluate(`fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "test", password: "test" }) }).then(r => r.status)`);

for (const route of targets) {
  await go(route);
  if (route === "/fta") {
    await evaluate(`document.querySelector(".component-library .library-card")?.click()`);
    await sleep(500);
  }
  const clicked = await evaluate(`(() => {
    const button = [...document.querySelectorAll("button")].find(b => /calculate|run analysis/i.test(b.textContent || ""));
    if (!button) return "no calculate button";
    button.click();
    return "clicked";
  })()`);
  await sleep(1200);
  const metrics = await evaluate(`(() => {
    const box = selector => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    };
    const root = document.querySelector(".workbench, .lcc-pm-workbench, .lcc-cm-workbench, .spares-workbench");
    return {
      doc: [document.documentElement.scrollWidth, innerWidth],
      root: box(".workbench, .lcc-pm-workbench, .lcc-cm-workbench, .spares-workbench"),
      kpi: box(".diagram-results, .lcc-kpi-strip"),
      toolbar: box("header"),
      body: box(".workbench-body, .lcc-pm-layout, .lcc-cm-layout, .spares-layout"),
      inspector: box(".workbench-inspector"),
      nodeEditor: box(".node-editor"),
      rootScroll: root ? [root.scrollWidth, root.clientWidth, root.scrollHeight, root.clientHeight] : null,
      bg: {
        theme: document.documentElement.dataset.theme,
        body: getComputedStyle(document.body).backgroundColor,
        gutter: (() => {
          return document.elementsFromPoint(250, 500).slice(0, 6).map(el => {
            const r = el.getBoundingClientRect();
            return {
              tag: el.tagName,
              cls: (el.className || "").toString().slice(0, 40),
              bg: getComputedStyle(el).backgroundColor,
              rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
            };
          });
        })(),
      },
    };
  })()`);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  const file = path.join(outDir, route.replace(/^\//, "") + ".png");
  await writeFile(file, Buffer.from(shot.data, "base64"));
  if (process.env.CLIP) {
    const clip = await send("Page.captureScreenshot", {
      format: "png",
      clip: { x: 216, y: 132, width: 90, height: 220, scale: 3 },
    });
    await writeFile(path.join(outDir, "gutter-zoom.png"), Buffer.from(clip.data, "base64"));
  }
  console.log(route, clicked, JSON.stringify(metrics));
}
ws.close();
process.exit(0);
