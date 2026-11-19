/**
 * Layout audit across routes and viewports.
 *
 *   node scripts/audit-layout.mjs http://127.0.0.1:4311 [route...]
 *
 * Prints one compact JSON line per route/viewport with the numbers that matter
 * for the "nothing clipped, scrollbars only where required" check:
 *   - page level horizontal overflow (documentElement.scrollWidth vs innerWidth)
 *   - the module shell box and whether the shell itself scrolls
 *   - toolbar height in rows (a single 46 px row is the target)
 *   - elements whose content is cut off by overflow:hidden (inputs excluded,
 *     they scroll their own text by design)
 *   - elements that own a scrollbar and by how much
 */
const base = process.argv[2] || "http://127.0.0.1:4311";
const routes = process.argv.slice(3);
const targets = routes.length
  ? routes
  : ["/rbd", "/fta", "/weibull", "/mil-std-217f", "/fmeca", "/lcc-pm", "/lcc-cm", "/spare-parts", "/data-register"];
const viewports = [
  [1920, 1080],
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [900, 800],
  [430, 900],
];

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
    if (waiters) {
      events.delete(msg.method);
      waiters.forEach(fn => fn(msg.params));
    }
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const messageId = ++id;
    pending.set(messageId, { resolve, reject });
    ws.send(JSON.stringify({ id: messageId, method, params }));
  });
const once = (method, timeout = 30000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout " + method)), timeout);
    const fn = params => {
      clearTimeout(timer);
      resolve(params);
    };
    events.set(method, [...(events.get(method) || []), fn]);
  });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function evaluate(source) {
  const result = await send("Runtime.evaluate", { expression: source, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + " " + (result.exceptionDetails.exception?.description || ""));
  return result.result.value;
}

const PROBE = `(() => {
  const root = document.querySelector(".workbench, .weibull-workbench, .mil217f-workbench, .fmeca-workbench, .lcc-pm-workbench, .lcc-cm-workbench, .spares-workbench");
  const main = document.querySelector(".main-area");
  const box = el => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
  };
  const name = el => {
    const cls = (el.className || "").toString().trim().split(/\\s+/)[0];
    return cls || el.tagName.toLowerCase();
  };
  const clipped = [];
  const scrollers = [];
  if (root) {
    for (const el of [root, ...root.querySelectorAll("*")]) {
      const s = getComputedStyle(el);
      const dx = el.scrollWidth - el.clientWidth;
      const dy = el.scrollHeight - el.clientHeight;
      const hidesX = /hidden|clip/.test(s.overflowX);
      const hidesY = /hidden|clip/.test(s.overflowY);
      const isInput = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      if (!isInput && ((hidesX && dx > 1) || (hidesY && dy > 1))) {
        clipped.push({
          el: name(el),
          box: box(el),
          over: [dx, dy],
          ell: s.textOverflow === "ellipsis",
          text: (el.textContent || "").trim().slice(0, 24),
        });
      }
      if (/(auto|scroll)/.test(s.overflowX + s.overflowY) && (dx > 1 || dy > 1)) {
        scrollers.push({ el: name(el), box: box(el), over: [dx, dy] });
      }
    }
  }
  const bar = root ? root.querySelector("header") : null;
  const barRows = bar ? new Set([...bar.children].map(el => Math.round(el.getBoundingClientRect().y))).size : 0;
  const table = root ? root.querySelector("table") : null;
  return {
    doc: [document.documentElement.scrollWidth, innerWidth],
    bodyH: [document.documentElement.scrollHeight, innerHeight],
    main: main ? { box: box(main), scroll: [main.scrollWidth, main.clientWidth, main.scrollHeight, main.clientHeight] } : null,
    root: root ? { box: box(root), scroll: [root.scrollWidth, root.clientWidth] } : null,
    toolbar: bar ? { box: box(bar), rows: barRows } : null,
    table: table ? { box: box(table), scroll: [table.scrollWidth, table.clientWidth] } : null,
    clipped: clipped.slice(0, 10),
    clippedCount: clipped.length,
    scrollers: scrollers.slice(0, 10),
  };
})()`;

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");

async function go(route) {
  const loaded = once("Page.loadEventFired");
  await send("Page.navigate", { url: base + route });
  await loaded.catch(() => {});
  await sleep(1600);
}

await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await go("/login");
await evaluate(
  `fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "test", password: "test" }) }).then(r => r.status)`,
);

const rows = [];
for (const [width, height] of viewports) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  for (const route of targets) {
    await go(route);
    const data = await evaluate(PROBE);
    rows.push({ route, viewport: `${width}x${height}`, ...data });
  }
}

for (const row of rows) {
  const pageScroll = row.doc[0] - row.doc[1];
  const shellScroll = row.main ? row.main.scroll[0] - row.main.scroll[1] : 0;
  const hard = row.clipped.filter(c => !c.ell);
  const soft = row.clipped.filter(c => c.ell);
  const clip = hard.map(c => `${c.el}:${c.over[0]}x${c.over[1]}"${c.text}"`).join(" | ");
  const ell = soft.map(c => `${c.el}:${c.over[0]}"${c.text}"`).join(" | ");
  const scroll = row.scrollers.map(s => `${s.el}:${s.over[0]}x${s.over[1]}`).join(" | ");
  console.log(
    [
      row.route.padEnd(14),
      row.viewport.padEnd(9),
      `page+${pageScroll}`,
      `shell+${shellScroll}`,
      `bar${row.toolbar ? row.toolbar.box[3] : 0}`,
      `root${row.root ? row.root.box[2] : 0}`,
      `tbl${row.table ? row.table.scroll[0] : 0}/${row.table ? row.table.box[2] : 0}`,
      `clip${hard.length}${clip ? " " + clip : ""}`,
      `ell${soft.length}${ell ? " " + ell : ""}`,
      `scroll{${scroll}}`,
    ].join("  "),
  );
}
ws.close();
process.exit(0);
