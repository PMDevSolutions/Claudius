import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChatWindow } from "./ChatWindow";
import { locales, type LocaleCode } from "../locales";
import type { ChatMessage as ChatMessageData } from "../api/types";

const sampleConversation: ChatMessageData[] = [
  { id: "1", role: "user", content: "What are your opening hours?" },
  {
    id: "2",
    role: "assistant",
    content: "We're open Monday to Friday, 9am to 5pm.",
  },
];

function localized(locale: LocaleCode) {
  const t = locales[locale];
  return {
    translations: t,
    title: t.title,
    subtitle: t.subtitle,
    welcomeMessage: t.welcomeMessage,
    placeholder: t.placeholder,
  };
}

const meta = {
  title: "Widget/ChatWindow",
  component: ChatWindow,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    messages: [],
    isLoading: false,
    error: null,
    onSend: () => {},
    onClose: () => {},
    onRetry: () => {},
  },
  render: (args, { globals }) => (
    <ChatWindow {...args} {...localized(globals.locale as LocaleCode)} />
  ),
} satisfies Meta<typeof ChatWindow>;

export default meta;

type Story = StoryObj<typeof meta>;

// Use the toolbar "Locale" control to switch between en / es / fr / de.
export const Empty: Story = {};

export const Conversation: Story = {
  args: { messages: sampleConversation },
};

export const Loading: Story = {
  args: { messages: sampleConversation, isLoading: true },
};

export const Error: Story = {
  render: (args, { globals }) => {
    const locale = globals.locale as LocaleCode;
    return (
      <ChatWindow
        {...args}
        {...localized(locale)}
        error={locales[locale].errorConnection}
        canRetry
      />
    );
  },
};
