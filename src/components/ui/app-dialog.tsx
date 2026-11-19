"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
};

export type PromptOptions = {
  title: string;
  message?: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  inputType?: "text" | "number";
  tone?: "default" | "danger";
  /** Returns an error message, or null when the value is acceptable. */
  validate?: (value: string) => string | null;
};

type ConfirmRequest = { kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void };
type PromptRequest = { kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };
type ActiveDialog = ConfirmRequest | PromptRequest;

type AppDialogValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
};

const AppDialogContext = createContext<AppDialogValue | null>(null);

/**
 * Application dialogs replace the browser's alert/prompt/confirm windows.
 * Every page renders inside `AppDialogProvider` (through AppShell), so any
 * component can await a styled confirmation or text prompt.
 */
export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<ActiveDialog | null>(null);
  const requestRef = useRef<ActiveDialog | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const openDialog = useCallback((next: ActiveDialog) => {
    requestRef.current = next;
    setRequest(next);
  }, []);

  const finish = useCallback((result: boolean | string | null) => {
    const active = requestRef.current;
    if (!active) return;
    requestRef.current = null;
    setRequest(null);
    if (active.kind === "confirm") active.resolve(Boolean(result));
    else active.resolve(typeof result === "string" ? result : null);
    window.setTimeout(() => previousFocus.current?.focus?.(), 0);
  }, []);

  useEffect(() => {
    if (!request) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setValue(request.kind === "prompt" ? request.options.defaultValue ?? "" : "");
    setError("");
    const focusTimer = window.setTimeout(() => {
      if (request.kind === "prompt") inputRef.current?.focus();
      else confirmRef.current?.focus();
    }, 30);
    const close = (next: boolean | string | null) => {
      if (request.kind === "prompt") finish(next === false ? null : next);
      else finish(Boolean(next));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(request.kind === "prompt" ? null : false); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.clearTimeout(focusTimer); window.removeEventListener("keydown", onKeyDown); };
  }, [request, finish]);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>(resolve => {
    openDialog({ kind: "confirm", options, resolve });
  }), [openDialog]);

  const prompt = useCallback((options: PromptOptions) => new Promise<string | null>(resolve => {
    openDialog({ kind: "prompt", options, resolve });
  }), [openDialog]);

  const api = useMemo<AppDialogValue>(() => ({ confirm, prompt }), [confirm, prompt]);

  function submitPrompt() {
    if (!request || request.kind !== "prompt") return;
    const validation = request.options.validate?.(value) ?? null;
    if (validation) { setError(validation); inputRef.current?.focus(); return; }
    finish(value);
  }

  return (
    <AppDialogContext.Provider value={api}>
      {children}
      {request && <div className="app-dialog-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) finish(request.kind === "prompt" ? null : false); }}>
        <section
          className={`app-dialog${request.options.tone === "danger" ? " danger" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-dialog-title"
          aria-describedby={request.options.message ? "app-dialog-message" : undefined}
        >
          <header>
            <span className="app-dialog-kicker">{request.kind === "confirm" ? "Please confirm" : "RAMSport"}</span>
            <h2 id="app-dialog-title">{request.options.title}</h2>
            {request.options.message && <p id="app-dialog-message">{request.options.message}</p>}
          </header>
          {request.kind === "prompt" ? (
            <form onSubmit={event => { event.preventDefault(); submitPrompt(); }}>
              <div className="app-dialog-body">
                {request.options.label && <label>{request.options.label}
                  <input
                    ref={inputRef}
                    type={request.options.inputType ?? "text"}
                    value={value}
                    placeholder={request.options.placeholder}
                    onChange={event => { setValue(event.target.value); setError(""); }}
                    autoComplete="off"
                  />
                </label>}
                {error && <p className="app-dialog-error" role="alert">{error}</p>}
              </div>
              <footer className="app-dialog-actions">
                <button type="button" className="app-dialog-cancel" onClick={() => finish(null)}>{request.options.cancelLabel ?? "Cancel"}</button>
                <button type="submit" className="app-dialog-confirm">{request.options.confirmLabel ?? "Continue"}</button>
              </footer>
            </form>
          ) : (
            <footer className="app-dialog-actions standalone">
              <button type="button" className="app-dialog-cancel" onClick={() => finish(false)}>{request.options.cancelLabel ?? "Cancel"}</button>
              <button ref={confirmRef} type="button" className="app-dialog-confirm" onClick={() => finish(true)}>{request.options.confirmLabel ?? "Continue"}</button>
            </footer>
          )}
        </section>
      </div>}
    </AppDialogContext.Provider>
  );
}

export function useAppDialog() {
  const context = useContext(AppDialogContext);
  if (!context) throw new Error("useAppDialog must be used inside AppDialogProvider");
  return context;
}
