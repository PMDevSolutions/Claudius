import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { ChatInput } from "./ChatInput";
import { locales, type LocaleCode } from "../locales";
import { DEFAULT_ATTACHMENT_OPTIONS } from "../utils/attachments";

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

// With attachments enabled a paperclip button appears; files can also be
// dropped on the composer or pasted from the clipboard.
export const WithAttachments: Story = {
  args: { attachments: DEFAULT_ATTACHMENT_OPTIONS },
};

// A pending image and PDF shown as removable previews above the input.
export const WithPendingAttachments: Story = {
  args: { attachments: DEFAULT_ATTACHMENT_OPTIONS },
  play: async ({ canvasElement }) => {
    const picker = within(canvasElement).getByLabelText(/attach a file/i, {
      selector: "input",
    });
    const png = new File(
      [
        Uint8Array.from(
          atob(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          ),
          (c) => c.charCodeAt(0),
        ),
      ],
      "screenshot.png",
      { type: "image/png" },
    );
    const pdf = new File(["%PDF-1.4 demo"], "invoice.pdf", {
      type: "application/pdf",
    });
    await userEvent.upload(picker, [png, pdf]);
  },
};
