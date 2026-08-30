import { useEffect, useMemo, useState } from "react";
import type { ClaudiusConfigObject } from "../config";
import { generateScriptSnippet } from "../lib/snippet";
import { openInCodeSandbox, openInStackBlitz } from "../lib/sandboxes";

interface SnippetPanelProps {
  config: ClaudiusConfigObject;
}

export function SnippetPanel({ config }: SnippetPanelProps) {
  const snippet = useMemo(() => generateScriptSnippet(config), [config]);
  const [copied, setCopied] = useState(false);
  const [sandboxError, setSandboxError] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
    } catch {
      // Clipboard can be unavailable (permissions, insecure context).
    }
  };

  const codeSandbox = async () => {
    setSandboxError(false);
    const ok = await openInCodeSandbox(config);
    if (!ok) setSandboxError(true);
  };

  return (
    <section className="panel snippet-panel" aria-label="Embed snippet">
      <div className="snippet-toolbar">
        <h2>Embed snippet</h2>
        <div className="snippet-actions">
          <button type="button" onClick={copy}>
            {copied ? "Copied!" : "Copy snippet"}
          </button>
          <button type="button" onClick={() => openInStackBlitz(config)}>
            Open in StackBlitz
          </button>
          <button type="button" onClick={codeSandbox}>
            Open in CodeSandbox
          </button>
        </div>
      </div>
      {sandboxError && (
        <p className="field-hint error">
          CodeSandbox didn't respond — try again, or use StackBlitz.
        </p>
      )}
      <pre className="snippet-code">
        <code>{snippet}</code>
      </pre>
      <p className="field-hint">
        Replace <code>apiUrl</code> with your deployed worker and add your
        site's origin to the worker's <code>ALLOWED_ORIGIN</code>. New to
        Claudius? Scaffold everything with{" "}
        <code>npm create claudius@latest</code>.
      </p>
    </section>
  );
}
