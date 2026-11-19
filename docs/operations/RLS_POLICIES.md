# Row-level ownership rules

RAMSport stores every account-scoped value under a key that includes the owner's account id.
This is the server equivalent of row-level security: a request can only reach the rows of the
account that owns the current session.

## Key format

```text
resource:accountId
```

| Resource | Key | Contents |
|---|---|---|
| File tree | `files:<accountId>` | Map of path to directory or file record |
| Profile | `profile:<accountId>` | Display name, avatar preset, photo data URL |
| Save locations | `save-locations:<accountId>` | Last document per module |
| Audit | `audit:<accountId>` | Last 200 events |
| Module scratchpad | `workspace:<accountId>:<key>` | Register snapshot, diagram or analysis document |

`accountId` must match `^[A-Za-z0-9_-]{1,80}$`. The value is validated before it is used in
a key, so a malformed id cannot escape its namespace.

## Request rules

1. Resolve the session from the signed `ramsport_session` cookie.
2. Load the account record by the session account id and confirm it is active.
3. For administrator endpoints, confirm `role === "admin"`.
4. Build every key with `rowKey(resource, accountId)` or `workspaceRecordKey(accountId, key)`.
5. Never accept `accountId` from a request body, query string or URL path.

The administrator directory (`users`) is the only global record. It contains no workspace
files, and it is only returned by administrator endpoints.

## Mutation rules

- File operations run through `updateFiles()` ? `mutateRecord("files:<accountId>")`, which
  uses optimistic concurrency (MongoDB) or a per-key queue and atomic rename (filesystem).
- The user directory runs through `updateUsers()`, which performs the read-modify-write as
  one operation.
- Renaming or deleting a folder rewrites every descendant key in the same operation.
- Remembered save locations are updated or cleared when a document or folder is renamed or
  deleted.
- Deleting an account removes its save locations and audit rows; its files are left in place
  so a recreated account is not silently destructive.
