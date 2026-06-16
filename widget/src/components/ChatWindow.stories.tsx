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

const longConversation: ChatMessageData[] = [
  { id: "1", role: "user", content: "Hi, can you help me plan a project?" },
  {
    id: "2",
    role: "assistant",
    content:
      "Absolutely. Tell me a bit about what you're building and your timeline.",
  },
  { id: "3", role: "user", content: "A marketing site with a blog." },
  {
    id: "4",
    role: "assistant",
    content:
      "Great choice. Do you already have branding and copy, or should we " +
      "start from scratch?",
  },
  { id: "5", role: "user", content: "We have branding, but need copy." },
  {
    id: "6",
    role: "assistant",
    content: "Got it. Roughly how many pages do you need at launch?",
  },
  { id: "7", role: "user", content: "Five or six to start." },
  {
    id: "8",
    role: "assistant",
    content:
      "That's very doable. A typical build like this takes two to three " +
      "weeks. Want a rough estimate?",
  },
  { id: "9", role: "user", content: "Yes please." },
  {
    id: "10",
    role: "assistant",
    content:
      "For five to six pages with copywriting and a blog, projects usually " +
      "start around $4,000. I can connect you with the team for a precise quote.",
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

// A longer history to check scrolling and spacing in the message list.
export const LongConversation: Story = {
  args: { messages: longConversation },
};

// On small screens the window becomes a full-width bottom sheet with a drag
// handle. Best viewed with a mobile viewport selected in the toolbar.
export const Mobile: Story = {
  args: { messages: sampleConversation, isMobile: true },
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
