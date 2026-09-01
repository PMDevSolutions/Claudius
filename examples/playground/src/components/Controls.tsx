import type {
  LocaleChoice,
  PlaygroundConfig,
  PositionChoice,
  ThemeChoice,
  TriggerConfig,
} from "../config";

interface ControlsProps {
  config: PlaygroundConfig;
  onChange: (next: PlaygroundConfig) => void;
}

const THEMES: Array<{ value: ThemeChoice; label: string }> = [
  { value: "light", label: "Light (default)" },
  { value: "dark", label: "Dark" },
  { value: "auto", label: "Auto (OS preference)" },
  { value: "default", label: "Theme: default" },
  { value: "minimal", label: "Theme: minimal" },
  { value: "playful", label: "Theme: playful" },
  { value: "corporate", label: "Theme: corporate" },
];

const POSITIONS: PositionChoice[] = [
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
];

const LOCALES: Array<{ value: LocaleChoice; label: string }> = [
  { value: "", label: "Auto-detect" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
];

export function Controls({ config, onChange }: ControlsProps) {
  const set = <K extends keyof PlaygroundConfig>(
    key: K,
    value: PlaygroundConfig[K],
  ) => onChange({ ...config, [key]: value });

  const setTrigger = <K extends keyof TriggerConfig>(
    key: K,
    value: TriggerConfig[K],
  ) => onChange({ ...config, trigger: { ...config.trigger, [key]: value } });

  return (
    <form className="controls" onSubmit={(e) => e.preventDefault()}>
      <fieldset>
        <legend>Text</legend>
        <label>
          Title
          <input
            type="text"
            value={config.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Locale default"
          />
        </label>
        <label>
          Subtitle
          <input
            type="text"
            value={config.subtitle}
            onChange={(e) => set("subtitle", e.target.value)}
            placeholder="Locale default"
          />
        </label>
        <label>
          Welcome message
          <textarea
            rows={2}
            value={config.welcomeMessage}
            onChange={(e) => set("welcomeMessage", e.target.value)}
            placeholder="Locale default"
          />
        </label>
        <label>
          Input placeholder
          <input
            type="text"
            value={config.placeholder}
            onChange={(e) => set("placeholder", e.target.value)}
            placeholder="Locale default"
          />
        </label>
        <label>
          Locale
          <select
            value={config.locale}
            onChange={(e) => set("locale", e.target.value as LocaleChoice)}
          >
            {LOCALES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>Appearance</legend>
        <label>
          Theme
          <select
            value={config.theme}
            onChange={(e) => set("theme", e.target.value as ThemeChoice)}
          >
            {THEMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="color-row">
          Accent color
          <span>
            <input
              type="color"
              value={config.accentColor || "#2563eb"}
              onChange={(e) => set("accentColor", e.target.value)}
              aria-label="Accent color"
            />
            <button
              type="button"
              className="link-button"
              disabled={!config.accentColor}
              onClick={() => set("accentColor", "")}
            >
              Reset
            </button>
          </span>
        </label>
        <label>
          Position
          <select
            value={config.position}
            onChange={(e) => set("position", e.target.value as PositionChoice)}
          >
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>Behavior</legend>
        <label className="check-row">
          <input
            type="checkbox"
            checked={config.persistMessages}
            onChange={(e) => set("persistMessages", e.target.checked)}
          />
          Persist messages across reloads
        </label>
      </fieldset>

      <fieldset>
        <legend>Proactive trigger</legend>
        <label className="check-row">
          <input
            type="checkbox"
            checked={config.trigger.enabled}
            onChange={(e) => setTrigger("enabled", e.target.checked)}
          />
          Enable trigger
        </label>

        {config.trigger.enabled && (
          <>
            <label>
              Fires on
              <select
                value={config.trigger.on}
                onChange={(e) =>
                  setTrigger("on", e.target.value as TriggerConfig["on"])
                }
              >
                <option value="time">Time on page</option>
                <option value="scroll">Scroll depth</option>
                <option value="exit-intent">Exit intent</option>
              </select>
            </label>

            {config.trigger.on === "time" && (
              <label>
                Seconds
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={config.trigger.seconds}
                  onChange={(e) =>
                    setTrigger("seconds", Math.max(1, Number(e.target.value)))
                  }
                />
              </label>
            )}

            {config.trigger.on === "scroll" && (
              <label>
                Scroll depth: {config.trigger.percent}%
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={config.trigger.percent}
                  onChange={(e) => setTrigger("percent", Number(e.target.value))}
                />
              </label>
            )}

            <label>
              Action
              <select
                value={config.trigger.action}
                onChange={(e) =>
                  setTrigger(
                    "action",
                    e.target.value as TriggerConfig["action"],
                  )
                }
              >
                <option value="greeting">Show greeting bubble</option>
                <option value="open">Open the chat</option>
              </select>
            </label>

            {config.trigger.action === "greeting" && (
              <label>
                Greeting text
                <input
                  type="text"
                  value={config.trigger.greeting}
                  onChange={(e) => setTrigger("greeting", e.target.value)}
                />
              </label>
            )}

            <p className="field-hint">
              Dismissing a greeting in the preview suppresses triggers for the
              frame's session — reload the preview to reset.
            </p>
          </>
        )}
      </fieldset>
    </form>
  );
}
