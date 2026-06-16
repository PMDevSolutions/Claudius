import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ErrorBanner } from "./ErrorBanner";
import { locales, type LocaleCode } from "../locales";

const meta = {
  title: "Widget/ErrorBanner",
  component: ErrorBanner,
  parameters: { widgetFrame: "messages" },
  args: {
    message: "Failed to connect. Please try again.",
    onRetry: fn(),
  },
  render: (args, { globals }) => (
    <ErrorBanner
      {...args}
      retryLabel={locales[globals.locale as LocaleCode].errorRetry}
    />
  ),
} satisfies Meta<typeof ErrorBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

// Network and timeout failures are retryable — a retry button is shown.
export const Retryable: Story = {};

// Validation and other terminal errors omit the retry affordance.
export const NonRetryable: Story = {
  args: {
    message: "That message is too long. Please shorten it.",
    onRetry: undefined,
  },
};
