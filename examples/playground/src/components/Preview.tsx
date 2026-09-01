import { useState } from "react";

export type Viewport = "desktop" | "mobile";

interface PreviewProps {
  hash: string;
  viewport: Viewport;
  onViewportChange: (viewport: Viewport) => void;
}

export function Preview({ hash, viewport, onViewportChange }: PreviewProps) {
  // Bumping the counter remounts the iframe: same-hash reloads (e.g. after a
  // dismissed greeting) wouldn't otherwise re-run the embed script.
  const [reloadCount, setReloadCount] = useState(0);
  const src = `preview.html#cfg=${hash}`;

  return (
    <section className="panel preview-panel" aria-label="Live preview">
      <div className="preview-toolbar">
        <div className="viewport-toggle" role="group" aria-label="Viewport">
          <button
            type="button"
            className={viewport === "desktop" ? "active" : ""}
            aria-pressed={viewport === "desktop"}
            onClick={() => onViewportChange("desktop")}
          >
            Desktop
          </button>
          <button
            type="button"
            className={viewport === "mobile" ? "active" : ""}
            aria-pressed={viewport === "mobile"}
            onClick={() => onViewportChange("mobile")}
          >
            Mobile
          </button>
        </div>
        <button
          type="button"
          className="link-button"
          onClick={() => setReloadCount((n) => n + 1)}
        >
          Reload preview
        </button>
      </div>

      <div className={`preview-stage ${viewport}`}>
        <iframe
          key={`${hash}:${reloadCount}`}
          src={src}
          title="Widget preview"
          className="preview-frame"
        />
      </div>
    </section>
  );
}
