import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ChatInput } from "../ChatInput";
import { DEFAULT_ATTACHMENT_OPTIONS } from "../../utils/attachments";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

function pngFile(name = "shot.png") {
  return new File([PNG], name, { type: "image/png" });
}

function pdfFile(name = "doc.pdf") {
  return new File(["%PDF-1.4"], name, { type: "application/pdf" });
}

function picker() {
  return screen.getByLabelText(/attach a file/i, { selector: "input" });
}

describe("ChatInput attachments", () => {
  it("hides the attach button when attachments are disabled", () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} />);
    expect(
      screen.queryByRole("button", { name: /attach a file/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the attach button and file picker when enabled", () => {
    render(
      <ChatInput
        onSend={vi.fn()}
        isLoading={false}
        attachments={DEFAULT_ATTACHMENT_OPTIONS}
      />,
    );
    expect(
      screen.getByRole("button", { name: /attach a file/i }),
    ).toBeInTheDocument();
    expect(picker()).toHaveAttribute(
      "accept",
      DEFAULT_ATTACHMENT_OPTIONS.allowedTypes.join(","),
    );
  });

  it("previews picked files and sends them with the message", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(
      <ChatInput
        onSend={onSend}
        isLoading={false}
        attachments={DEFAULT_ATTACHMENT_OPTIONS}
      />,
    );

    await user.upload(picker(), [pngFile(), pdfFile()]);

    expect(
      await screen.findByRole("img", { name: "shot.png" }),
    ).toHaveAttribute("src", expect.stringMatching(/^data:image\/png;base64,/));
    expect(screen.getByText("doc.pdf")).toBeInTheDocument();

    await user.type(screen.getByRole("textbox"), "What is this?{enter}");

    expect(onSend).toHaveBeenCalledTimes(1);
    const [text, attachments] = onSend.mock.calls[0];
    expect(text).toBe("What is this?");
    expect(attachments).toHaveLength(2);
    expect(attachments[0]).toMatchObject({
      name: "shot.png",
      mediaType: "image/png",
      size: PNG.byteLength,
    });
    expect(attachments[0].data).toBeTruthy();
    expect(attachments[1]).toMatchObject({
      name: "doc.pdf",
      mediaType: "application/pdf",
    });

    // The composer resets after sending.
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("allows sending an attachment without any text", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(
      <ChatInput
        onSend={onSend}
        isLoading={false}
        attachments={DEFAULT_ATTACHMENT_OPTIONS}
      />,
    );
    await user.upload(picker(), pngFile());
    await screen.findByRole("img");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(onSend).toHaveBeenCalledWith("", [
      expect.objectContaining({ name: "shot.png" }),
    ]);
  });

  it("removes a pending attachment", async () => {
    const user = userEvent.setup();
    render(
      <ChatInput
        onSend={vi.fn()}
        isLoading={false}
        attachments={DEFAULT_ATTACHMENT_OPTIONS}
      />,
    );
    await user.upload(picker(), pngFile());
    await user.click(
      await screen.findByRole("button", {
        name: "Remove attachment: shot.png",
      }),
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("rejects disallowed types and oversized files with an alert", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(
      <ChatInput
        onSend={vi.fn()}
        isLoading={false}
        attachments={{ ...DEFAULT_ATTACHMENT_OPTIONS, maxSizeBytes: 4 }}
      />,
    );

    await user.upload(
      picker(),
      new File(["hello"], "notes.txt", { type: "text/plain" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "notes.txt is not a supported file type.",
    );

    await user.upload(picker(), pngFile("huge.png"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "huge.png is too large. The maximum size is 4 B.",
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("enforces the per-message count and disables the attach button", async () => {
    const user = userEvent.setup();
    render(
      <ChatInput
        onSend={vi.fn()}
        isLoading={false}
        attachments={{ ...DEFAULT_ATTACHMENT_OPTIONS, maxCount: 1 }}
      />,
    );
    await user.upload(picker(), [pngFile("a.png"), pngFile("b.png")]);

    expect(
      await screen.findByRole("img", { name: "a.png" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: "b.png" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "You can attach up to 1 files per message.",
    );
    expect(
      screen.getByRole("button", { name: /attach a file/i }),
    ).toBeDisabled();
  });

  it("accepts files pasted into the input", async () => {
    render(
      <ChatInput
        onSend={vi.fn()}
        isLoading={false}
        attachments={DEFAULT_ATTACHMENT_OPTIONS}
      />,
    );
    fireEvent.paste(screen.getByRole("textbox"), {
      clipboardData: {
        files: [pngFile("pasted.png")],
        types: ["Files"],
        getData: () => "",
      },
    });
    expect(
      await screen.findByRole("img", { name: "pasted.png" }),
    ).toBeInTheDocument();
  });

  it("highlights on drag and accepts dropped files", async () => {
    render(
      <ChatInput
        onSend={vi.fn()}
        isLoading={false}
        attachments={DEFAULT_ATTACHMENT_OPTIONS}
      />,
    );
    const form = screen.getByRole("textbox").closest("form")!;

    fireEvent.dragEnter(form, {
      dataTransfer: { types: ["Files"], files: [] },
    });
    expect(form).toHaveAttribute("data-drag-over", "true");
    expect(screen.getByText("Drop files to attach")).toBeInTheDocument();

    fireEvent.drop(form, {
      dataTransfer: { types: ["Files"], files: [pngFile("dropped.png")] },
    });
    expect(form).not.toHaveAttribute("data-drag-over");
    expect(
      await screen.findByRole("img", { name: "dropped.png" }),
    ).toBeInTheDocument();
  });

  it("ignores pasted and dropped files when attachments are disabled", async () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} />);
    const input = screen.getByRole("textbox");
    fireEvent.paste(input, {
      clipboardData: {
        files: [pngFile()],
        types: ["Files"],
        getData: () => "",
      },
    });
    fireEvent.drop(input.closest("form")!, {
      dataTransfer: { types: ["Files"], files: [pngFile()] },
    });
    await waitFor(() => {
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });
  });
});
