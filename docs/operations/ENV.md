# Environment configuration

Copy `.env.example` to `.env.local` for local development and set the same values in the
hosting provider for production. Never commit `.env.local`.

The server stores all workspace data. It uses MongoDB when `MONGODB_URI` is set and a local
filesystem store otherwise.

| Variable | Required | Purpose |
|---|---:|---|
| `MONGODB_URI` | Production | MongoDB connection string. Strongly recommended for Vercel or any host without a persistent disk. |
| `MONGODB_DATABASE` | No | Database name. Defaults to `ramsport`. |
| `RAMSPORT_DATA_DIR` | No | Filesystem store directory used when `MONGODB_URI` is unset. Defaults to `.ramsport-data/` (or a temp directory on Vercel). |
| `RAMSPORT_SESSION_SECRET` | Recommended | HMAC key for session cookies, at least 32 characters. When unset a random secret is generated once and stored in the database. |
| `RAMSPORT_COOKIE_SECURE` | No | `true` or `false` to override the Secure cookie flag. By default it follows the request protocol / `X-Forwarded-Proto`. |
| `NEXT_PUBLIC_BASE_PATH` | No | Sub-path for a project-site deployment, for example `/RAMSport`. Leave unset for Vercel, Render or a root custom domain. |
| `NEXT_PUBLIC_SHOW_TEST_ACCESS` | No | Set to `off` to hide the **Test access** (`test` / `test`) card on the sign-in page. Shown by default for evaluation builds. Read at build time. |
| `NODE_VERSION` | No | Hosting hint for Render. `20.18.0` is used by `render.yaml`. |
| `NODE_ENV` | Managed | Set by Next.js for production builds. Do not set it manually. |

## Notes

- `NEXT_PUBLIC_BASE_PATH` and `NEXT_PUBLIC_SHOW_TEST_ACCESS` are read at build time. Rebuild
  after changing them.
- The test-access card exposes the built-in `test` / `test` account on purpose, for
  evaluation and QA. Set `NEXT_PUBLIC_SHOW_TEST_ACCESS=off` for a public production release.
- Without `MONGODB_URI` on a serverless host, the filesystem store is **ephemeral**; the
  server logs a warning at startup and data is lost on redeploy. Use MongoDB in production.
- Set `RAMSPORT_SESSION_SECRET` explicitly when running more than one server instance, or
  after rotating it deliberately to invalidate every existing session.
- The session cookie is `HttpOnly`, `SameSite=Lax` and `Secure` over HTTPS. It contains no
  account data beyond a signed account id, username, role and expiry.
- MongoDB credentials and the session secret are server-only secrets. Do not expose them
  with a `NEXT_PUBLIC_` prefix.
