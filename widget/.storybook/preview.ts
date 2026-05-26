import type { Preview } from "@storybook/react-vite";
import type { LocaleCode } from "../src/locales";
import "../src/styles.css";

const LOCALE_ITEMS: { value: LocaleCode; title: string }[] = [
  { value: "en", title: "English" },
  { value: "es", title: "Español" },
  { value: "fr", title: "Français" },
  { value: "de", title: "Deutsch" },
];

const preview: Preview = {
  parameters: {
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
  },
  initialGlobals: {
    locale: "en",
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
  },
};

export default preview;
