import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ChatHeader } from "./ChatHeader";
import { locales, type LocaleCode } from "../locales";

const meta = {
  title: "Widget/Header",
  component: ChatHeader,
  parameters: { widgetFrame: "panel" },
  args: {
    title: "Support",
    subtitle: "Ask me anything",
    onClose: fn(),
  },
  render: (args, { globals }) => (
    <ChatHeader
      {...args}
      closeLabel={locales[globals.locale as LocaleCode].closeChat}
    />
  ),
} satisfies Meta<typeof ChatHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// Long titles stay on one line; the avatar uses the first character.
export const LongTitle: Story = {
  args: {
    title: "PMDS Customer Success Team",
    subtitle: "We typically reply within a few minutes",
  },
};
