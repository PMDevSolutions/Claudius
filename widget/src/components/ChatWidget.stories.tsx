import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ChatWidget } from "./ChatWidget";
import type { LocaleCode } from "../locales";

const meta = {
  title: "Widget/ChatWidget",
  component: ChatWidget,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    apiUrl: "https://example.workers.dev",
  },
  render: (args, { globals }) => (
    <ChatWidget {...args} locale={globals.locale as LocaleCode} />
  ),
} satisfies Meta<typeof ChatWidget>;

export default meta;

type Story = StoryObj<typeof meta>;

// Use the toolbar "Locale" control to switch between en / es / fr / de.
export const Closed: Story = {};

export const Opened: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = await canvas.findByRole("button");
    await userEvent.click(toggle);
    await expect(await canvas.findByRole("dialog")).toBeInTheDocument();
  },
};
