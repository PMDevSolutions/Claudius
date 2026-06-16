import type { Preview, Decorator } from "@storybook/react-vite";
import type { LocaleCode } from "../src/locales";
import "../src/styles.css";

const LOCALE_ITEMS: { value: LocaleCode; title: string }[] = [
  { value: "en", title: "English" },
  { value: "es", title: "Español" },
  { value: "fr", title: "Français" },
  { value: "de", title: "Deutsch" },
];

type ThemeMode = "light" | "dark" | "auto";

/**
 * Mirrors ChatWidget's own logic: dark mode is driven by a `data-claudius-dark`
 * ancestor (see styles.css), and "auto" follows the OS `prefers-color-scheme`.
 */
function resolveDark(theme: ThemeMode): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/**
 * Wraps every story in the widget's theming context:
 * - `.claudius-root` + `data-claudius-dark` so `--cl-*` tokens resolve exactly
 *   as they do in production (light is the default; dark flips the tokens).
 * - `dir` for RTL coverage.
 * - an optional widget-shaped frame for components that normally live inside
 *   the chat panel, opted into via `parameters.widgetFrame` ("panel" renders
 *   edge-to-edge like the header/input; "messages" pads like the message list).
 */
const withWidgetTheme: Decorator = (Story, context) => {
  const theme = (context.globals.theme as ThemeMode) ?? "light";
  const direction = (context.globals.direction as "ltr" | "rtl") ?? "ltr";
  const dark = resolveDark(theme);
  const frame = context.parameters.widgetFrame as
    | "panel"
    | "messages"
    | undefined;

  let inner = <Story />;
  if (frame === "panel") {
    inner = (
      <div className="w-[380px] overflow-hidden rounded-claudius-lg bg-claudius-surface font-body shadow-claudius-elevated">
        {inner}
      </div>
    );
  } else if (frame === "messages") {
    inner = (
      <div className="w-[380px] space-y-3 rounded-claudius-lg bg-claudius-surface p-4 font-body shadow-claudius-elevated">
        {inner}
      </div>
    );
  }

  return (
    <div
      className="claudius-root"
      data-claudius-dark={dark ? "true" : "false"}
      dir={direction}
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: frame ? "center" : "stretch",
        justifyContent: frame ? "center" : "stretch",
        padding: frame ? "2rem" : 0,
        background: dark ? "#030712" : "#f1f5f9",
      }}
    >
      {inner}
    </div>
  );
};

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
  },
  initialGlobals: {
    locale: "en",
    theme: "light",
    direction: "ltr",
  },
  globalTypes: {
    locale: {
      description: "Widget UI locale",
      toolbar: {
        title: "Locale",
        icon: "globe",
        items: LOCALE_ITEMS,
        dynamicTitle: true,
      },
    },
    theme: {
      description: "Color scheme",
      toolbar: {
        title: "Theme",
        icon: "contrast",
        items: [
          { value: "light", title: "Light", icon: "sun" },
          { value: "dark", title: "Dark", icon: "moon" },
          { value: "auto", title: "Auto (OS)", icon: "browser" },
        ],
        dynamicTitle: true,
      },
    },
    direction: {
      description: "Text direction",
      toolbar: {
        title: "Direction",
        icon: "transfer",
        items: [
          { value: "ltr", title: "LTR" },
          { value: "rtl", title: "RTL" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [withWidgetTheme],
};

export default preview;
