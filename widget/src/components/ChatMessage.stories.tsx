import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ChatMessage } from "./ChatMessage";
import type { Source } from "../api/types";

const meta = {
  title: "Widget/ChatMessage",
  component: ChatMessage,
  parameters: { widgetFrame: "messages" },
  args: {
    role: "assistant",
    content: "Hi! How can I help you today?",
  },
} satisfies Meta<typeof ChatMessage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const User: Story = {
  args: { role: "user", content: "What are your opening hours?" },
};

export const Bot: Story = {
  args: {
    role: "assistant",
    content: "We're open Monday to Friday, 9am to 5pm.",
  },
};

// Exercises the inline formatter: **bold**, *italic*, line breaks, and links.
export const Markdown: Story = {
  args: {
    role: "assistant",
    content:
      "Here's what I can help with:\n" +
      "**Bookings**, *rescheduling*, and general questions.\n" +
      "Full details live at https://pmds.info/services",
  },
};

const sources: Source[] = [
  { url: "https://pmds.info/blog/seo-tips", title: "SEO Tips", type: "blog" },
  { url: "https://pmds.info/services", title: "Our Services", type: "page" },
  {
    url: "https://example.com/guide",
    title: "External Guide",
    type: "external",
  },
];

// Assistant replies can cite sources, surfaced via the source-count icon.
export const WithSources: Story = {
  args: {
    role: "assistant",
    content: "Great question — here are a few resources that should help.",
    sources,
    isSourceActive: false,
    onSourceClick: fn(),
  },
};
