import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { GreetingBubble } from "./GreetingBubble";
import { locales, type LocaleCode } from "../locales";

const meta = {
  title: "Widget/GreetingBubble",
  component: GreetingBubble,
  args: {
    message: "Need a hand? Ask me anything about our services.",
    position: "bottom-right",
    onOpen: fn(),
    onDismiss: fn(),
  },
  render: (args, { globals }) => (
    <GreetingBubble
      {...args}
      dismissLabel={locales[globals.locale as LocaleCode].dismissGreeting}
    />
  ),
} satisfies Meta<typeof GreetingBubble>;

export default meta;

type Story = StoryObj<typeof meta>;

// The proactive greeting anchors to whichever corner the widget sits in.
export const BottomRight: Story = { args: { position: "bottom-right" } };
export const BottomLeft: Story = { args: { position: "bottom-left" } };
export const TopRight: Story = { args: { position: "top-right" } };
export const TopLeft: Story = { args: { position: "top-left" } };

export const LongMessage: Story = {
  args: {
    message:
      "Welcome back! Looking for pricing, availability, or help with an " +
      "existing booking? I'm here whenever you're ready.",
  },
};
