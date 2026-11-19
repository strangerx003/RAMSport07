/** Compare raw server HTML vs live DOM for /data-register. */
const login = await fetch("http://127.0.0.1:3000/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test" })
});
const cookie = (login.headers.getSetCookie ? login.headers.getSetCookie() : [login.headers.get("set-cookie")]).map(c => c.split(";")[0]).join("; ");
console.log("login status:", login.status, "cookie:", cookie.slice(0, 40) + "...");

const page = await fetch("http://127.0.0.1:3000/data-register", { headers: { cookie } });
const html = await page.text();
console.log("server status:", page.status, "html length:", html.length);
console.log("has register-table:", html.includes("register-table"));
console.log("has main-area:", html.includes("main-area"));
console.log("has login:", html.includes("password"));
const bodyStart = html.indexOf("<body");
console.log("body snippet:", html.slice(bodyStart, bodyStart + 600));

// Now the live DOM children
const created = await (await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", rej, { once: true }); });
let id = 0; const pending = new Map();
ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Page.enable"); await send("Runtime.enable");
// Set the session cookie directly in the browser
const [name, ...rest] = cookie.split("=");
await send("Network.setCookie", { name, value: rest.join("="), domain: "127.0.0.1", path: "/" });
await send("Page.navigate", { url: "http://127.0.0.1:3000/data-register" });
await new Promise(r => setTimeout(r, 8000));
const r = await send("Runtime.evaluate", {
  expression: `JSON.stringify({
    url: location.href,
    children: Array.from(document.body.children).map(el => el.tagName + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : "")),
    textLen: document.body.innerText.length,
    hasTable: !!document.querySelector(".register-table")
  })`,
  returnByValue: true
});
console.log("DOM:", r.result.value);
ws.close();
process.exit(0);
