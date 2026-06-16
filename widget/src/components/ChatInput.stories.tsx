import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { ChatInput } from "./ChatInput";
import { locales, type LocaleCode } from "../locales";

const meta = {
  title: "Widget/ChatInput",
  component: ChatInput,
  parameters: { widgetFrame: "panel" },
  args: {
    isLoading: false,
    onSend: fn(),
  },
  render: (args, { globals }) => {
    const t = locales[globals.locale as LocaleCode];
    return <ChatInput {...args} translations={t} placeholder={t.placeholder} />;
  },
} satisfies Meta<typeof ChatInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// Input and send button are disabled while a reply is in flight.
export const Loading: Story = {
  args: { isLoading: true },
};

// The character counter appears once the message passes the warning threshold.
export const NearLimit: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole("textbox");
    await userEvent.click(input);
    await userEvent.paste("a".repeat(1850));
  },
};

// At the 2000-char limit the counter turns red and send is disabled.
export const AtLimit: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole("textbox");
    await userEvent.click(input);
    await userEvent.paste("a".repeat(2000));
  },
};
