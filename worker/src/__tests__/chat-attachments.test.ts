import { describe, it, expect, vi } from "vitest";

const createMock = vi.fn().mockResolvedValue({
  content: [{ type: "text", text: "I see a receipt." }],
  usage: { input_tokens: 100, output_tokens: 5 },
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: createMock };
  },
}));

import { handleChat } from "../chat";
import { bytesToBase64 } from "../attachments";

const PNG_B64 = bytesToBase64(
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9])
);
const PDF_B64 = bytesToBase64(new TextEncoder().encode("%PDF-1.4 tiny"));

describe("handleChat with attachments", () => {
  it("forwards images and PDFs as content blocks before the text", async () => {
    createMock.mockClear();
    await handleChat(
      {
        messages: [
          { role: "user", content: "hello" },
          { role: "assistant", content: "hi" },
          {
            role: "user",
            content: "What is the total?",
            attachments: [
              { id: "i", name: "shot.png", mediaType: "image/png", size: 10, data: PNG_B64 },
              { id: "p", name: "bill.pdf", mediaType: "application/pdf", size: 13, data: PDF_B64 },
            ],
          },
        ],
      },
      "key"
    );

    const params = createMock.mock.calls[0][0];
    // Plain messages keep the string wire shape.
    expect(params.messages[0]).toEqual({ role: "user", content: "hello" });
    expect(params.messages[1]).toEqual({ role: "assistant", content: "hi" });
    expect(params.messages[2]).toEqual({
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: "image/png", data: PNG_B64 },
        },
        {
          type: "document",
          title: "bill.pdf",
          source: { type: "base64", media_type: "application/pdf", data: PDF_B64 },
        },
        { type: "text", text: "What is the total?" },
      ],
    });
  });

  it("allows an attachment-only message and omits the empty text block", async () => {
    createMock.mockClear();
    const result = await handleChat(
      {
        messages: [
          {
            role: "user",
            content: "",
            attachments: [
              { id: "i", name: "shot.png", mediaType: "image/png", size: 10, data: PNG_B64 },
            ],
          },
        ],
      },
      "key"
    );
    expect(result.response.reply).toBe("I see a receipt.");
    const content = createMock.mock.calls[0][0].messages[0].content;
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("image");
  });

  it("renders a note for attachments whose bytes are gone", async () => {
    createMock.mockClear();
    await handleChat(
      {
        messages: [
          {
            role: "user",
            content: "and this one?",
            attachments: [{ id: "i", name: "old.png", mediaType: "image/png", size: 10 }],
          },
        ],
      },
      "key"
    );
    const content = createMock.mock.calls[0][0].messages[0].content;
    expect(content[0]).toEqual({
      type: "text",
      text: '[Attachment "old.png" (image/png) is no longer available]',
    });
  });

  it("rejects a message with neither text nor attachments", async () => {
    await expect(
      handleChat({ messages: [{ role: "user", content: "   " }] }, "key")
    ).rejects.toThrow("Message content is required");
  });

  it("ignores attachments on assistant messages", async () => {
    createMock.mockClear();
    await handleChat(
      {
        messages: [
          { role: "user", content: "x" },
          {
            role: "assistant",
            content: "y",
            attachments: [{ id: "i", name: "a.png", mediaType: "image/png", size: 1, data: PNG_B64 }],
          },
          { role: "user", content: "z" },
        ],
      },
      "key"
    );
    expect(createMock.mock.calls[0][0].messages[1]).toEqual({ role: "assistant", content: "y" });
  });
});
