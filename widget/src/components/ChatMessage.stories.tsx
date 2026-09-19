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

// A user message carrying an image preview and a PDF chip.
export const WithAttachments: Story = {
  args: {
    role: "user",
    content: "Can you read the total on this receipt?",
    attachments: [
      {
        id: "att-1",
        name: "receipt.png",
        mediaType: "image/png",
        size: 68,
        data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      },
      {
        id: "att-2",
        name: "invoice-2026-06.pdf",
        mediaType: "application/pdf",
        size: 184_320,
      },
    ],
  },
};

const speechLabels = {
  play: "Read aloud",
  pause: "Pause reading",
  resume: "Resume reading",
  stop: "Stop reading",
};

// Read-aloud control under a settled assistant reply.
export const WithReadAloud: Story = {
  args: {
    role: "assistant",
    content: "Our plans start at $10 a month. Want a quick comparison?",
    speech: {
      state: "idle",
      labels: speechLabels,
      onPlay: fn(),
      onPause: fn(),
      onResume: fn(),
      onStop: fn(),
    },
  },
};

// While a reply is being read, the speaker becomes pause and stop.
export const ReadingAloud: Story = {
  args: {
    ...WithReadAloud.args,
    speech: {
      state: "speaking",
      labels: speechLabels,
      onPlay: fn(),
      onPause: fn(),
      onResume: fn(),
      onStop: fn(),
    },
  },
};
