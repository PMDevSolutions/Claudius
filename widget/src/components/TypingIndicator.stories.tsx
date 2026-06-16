import type { Meta, StoryObj } from "@storybook/react-vite";
import { TypingIndicator } from "./TypingIndicator";
import { locales, type LocaleCode } from "../locales";

const meta = {
  title: "Widget/TypingIndicator",
  component: TypingIndicator,
  parameters: { widgetFrame: "messages" },
  render: (_args, { globals }) => (
    <TypingIndicator
      label={locales[globals.locale as LocaleCode].typingIndicator}
    />
  ),
} satisfies Meta<typeof TypingIndicator>;

export default meta;

type Story = StoryObj<typeof meta>;

// Animated dots while the assistant composes a reply. The bounce is disabled
// under prefers-reduced-motion (toggle "Reduced motion" in your OS to verify).
export const Default: Story = {};
