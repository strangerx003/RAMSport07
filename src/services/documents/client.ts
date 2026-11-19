type PendingSave = { data: unknown; timer: ReturnType<typeof setTimeout> };

const pending = new Map<string, PendingSave>();
const SAVE_DELAY_MS = 650;

function endpoint(documentPath: string) {
  return `/api/files/content?${new URLSearchParams({ path: documentPath }).toString()}`;
}

export async function loadDocument(documentPath: string): Promise<unknown | null> {
  try {
    const response = await fetch(endpoint(documentPath), { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json() as { data?: unknown };
    return payload.data ?? null;
  } catch {
    return null;
  }
}

export async function saveDocument(documentPath: string, data: unknown, keepalive = false) {
  try {
    const response = await fetch("/api/files/content", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: documentPath, data }),
      keepalive,
    });
    if (!response.ok) console.warn(`Document save failed for ${documentPath}: ${response.status}`);
  } catch {
    // The edit stays in memory; the next change retries the server file write.
  }
}

/** Debounced write-through so rapid diagram edits produce one file write. */
export function queueDocumentSave(documentPath: string, data: unknown) {
  const previous = pending.get(documentPath);
  if (previous) clearTimeout(previous.timer);
  const timer = setTimeout(() => {
    pending.delete(documentPath);
    void saveDocument(documentPath, data);
  }, SAVE_DELAY_MS);
  pending.set(documentPath, { data, timer });
}

export function flushDocumentSaves() {
  for (const [documentPath, entry] of pending) {
    clearTimeout(entry.timer);
    void saveDocument(documentPath, entry.data, true);
  }
  pending.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushDocumentSaves);
}
