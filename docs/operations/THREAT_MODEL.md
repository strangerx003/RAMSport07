# Threat model

## Assets and boundaries

Assets include credentials, session tokens, profile data, RBD/FTA/Data Register files,
analysis documents, calculation results, exports and the server audit trail.

Trust boundaries:

1. **Browser ? Next.js `/api/*`** ? the browser is untrusted; every request is authenticated
   from the signed HttpOnly cookie and authorized by the server.
2. **Next.js ? MongoDB / filesystem** ? credentials and the data directory are server-side
   secrets that the browser never receives.

| Threat | Control | Residual risk |
|---|---|---|
| Credential guessing | PBKDF2-SHA-256, 310,000 iterations; bounded per-username login throttle | Limiter state is per process and resets on restart |
| Session forgery | HMAC-SHA-256 signature compared in constant time; eight-hour expiry | The signing secret must be protected |
| Session theft | `HttpOnly`, `SameSite=Lax`, `Secure` over HTTPS; account re-read on every request | A compromised browser or proxy can still replay a live cookie |
| Cross-account access through a request | Account id comes from the signed session; every key is `resource:accountId`; admin role re-checked | A bug that accepts an id from the body would break this; covered by regression tests |
| Cross-site request forgery | SameSite cookie plus same-origin `Origin`/`Sec-Fetch-Site` check | A misconfigured proxy could strip `Origin` |
| Path traversal | Path segments validated; `.`/`..` rejected; depth and name limits | None known inside the API contract |
| Oversized documents or photos | 2 MB document, 5 MB photo and 5 MB scratchpad limits | Large records still consume database space |
| Malicious file content | Documents are parsed as JSON; previews render app data, not HTML | A future renderer that injects HTML would need review |
| Malicious upload | Only PNG, JPEG and WebP are accepted, stored and served with `nosniff` | Image decoders remain in the browser |
| Audit repudiation | Allow-listed actions; bounded per-account trail on the server | A database administrator can edit records |
| Supply-chain script | CSP restricts scripts to self; production CSP omits `unsafe-eval` | Inline scripts are allowed for Next.js hydration |
| Framing / clickjacking | `frame-ancestors 'none'` and `X-Frame-Options: DENY` | Host must forward the headers |
| Transport interception | HSTS and HTTPS hosting | Host configuration |
| Data loss | MongoDB or persistent disk on the server | A misconfigured serverless filesystem is ephemeral; the server warns |
| DoS through record growth | Bounded audit trail, login limiter and document/scratchpad sizes | There is no per-account storage quota |

## Out of scope

- Protection from a compromised server host or database administrator.
- MFA, self-service password reset and per-session revocation.
- Multi-tenant billing quotas and rate limiting beyond sign-in.
