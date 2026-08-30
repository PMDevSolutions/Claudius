import { useEffect, useMemo, useState } from "react";
import {
  DEMO_API_URL,
  SNIPPET_API_URL,
  defaultConfig,
  presets,
  toClaudiusConfig,
  type PlaygroundConfig,
} from "./config";
import { encodeConfig } from "./lib/encode";
import { Controls } from "./components/Controls";
import { Preview, type Viewport } from "./components/Preview";
import { SnippetPanel } from "./components/SnippetPanel";

/** Debounce a value so the preview iframe doesn't reload on every keystroke. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function App() {
  const [config, setConfig] = useState<PlaygroundConfig>(defaultConfig);
  const [presetName, setPresetName] = useState<string>(presets[0].name);
  const [viewport, setViewport] = useState<Viewport>("desktop");

  const debouncedConfig = useDebounced(config, 400);

  // The preview talks to the live demo worker; the snippet shows a
  // placeholder the adopter swaps for their own worker URL.
  const previewHash = useMemo(
    () =>
      encodeConfig({
        ...toClaudiusConfig(debouncedConfig, DEMO_API_URL),
        storageKeyPrefix: "claudius-playground",
      }),
    [debouncedConfig],
  );
  const snippetConfig = useMemo(
    () => toClaudiusConfig(config, SNIPPET_API_URL),
    [config],
  );

  const applyPreset = (name: string) => {
    const preset = presets.find((p) => p.name === name);
    if (!preset) return;
    setPresetName(name);
    // Deep-copy so control edits never mutate the preset definition.
    setConfig(structuredClone(preset.config));
  };

  const handleChange = (next: PlaygroundConfig) => {
    setConfig(next);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Claudius Playground</h1>
          <p>
            Tweak every widget prop live, then copy the embed snippet.{" "}
            <a
              href="https://claudius-docs.pages.dev"
              target="_blank"
              rel="noreferrer"
            >
              Docs
            </a>{" "}
            ·{" "}
            <a
              href="https://github.com/PMDevSolutions/Claudius"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </p>
        </div>
        <label className="preset-picker">
          Preset
          <select
            value={presetName}
            onChange={(e) => applyPreset(e.target.value)}
          >
            {presets.map((p) => (
              <option key={p.name} value={p.name} title={p.description}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="app-body">
        <aside className="panel controls-panel">
          <Controls config={config} onChange={handleChange} />
        </aside>

        <main className="preview-column">
          <Preview
            hash={previewHash}
            viewport={viewport}
            onViewportChange={setViewport}
          />
          <SnippetPanel config={snippetConfig} />
        </main>
      </div>
    </div>
  );
}
