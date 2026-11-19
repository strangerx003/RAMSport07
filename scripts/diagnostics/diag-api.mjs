/** Probe every API endpoint the shell needs during boot. */
const login = await fetch("http://127.0.0.1:3000/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "test", password: "test" })
});
const cookie = (login.headers.getSetCookie ? login.headers.getSetCookie() : [login.headers.get("set-cookie")]).map(c => c.split(";")[0]).join("; ");
console.log("login:", login.status);

const probes = [
  ["/api/auth/session", "GET"],
  ["/api/profile", "GET"],
  ["/api/auth/session", "GET"],
  ["/api/documents", "GET"],
];
for (const [url, method] of probes) {
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch("http://127.0.0.1:3000" + url, { method, headers: { cookie }, signal: controller.signal });
    clearTimeout(timer);
    const text = await res.text();
    console.log(`${method} ${url} -> ${res.status} in ${Date.now() - started}ms: ${text.slice(0, 160)}`);
  } catch (e) {
    console.log(`${method} ${url} -> FAILED in ${Date.now() - started}ms: ${e.message}`);
  }
}
process.exit(0);
