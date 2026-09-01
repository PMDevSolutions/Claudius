import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ChatMessage } from "../ChatMessage";
import type { ChatAttachment } from "../../api/types";

const image: ChatAttachment = {
  id: "a1",
  name: "receipt.png",
  mediaType: "image/png",
  size: 2048,
  data: "AA==",
};

const pdf: ChatAttachment = {
  id: "a2",
  name: "invoice.pdf",
  mediaType: "application/pdf",
  size: 3 * 1024 * 1024,
};

describe("ChatMessage attachments", () => {
  it("renders an inline image preview and a PDF chip", () => {
    render(
      <ChatMessage
        role="user"
        content="Here you go"
        attachments={[image, pdf]}
      />,
    );
    expect(screen.getByRole("img", { name: "receipt.png" })).toHaveAttribute(
      "src",
      "data:image/png;base64,AA==",
    );
    expect(screen.getByText("invoice.pdf")).toBeInTheDocument();
    expect(screen.getByText("3 MB")).toBeInTheDocument();
    expect(screen.getByText("Here you go")).toBeInTheDocument();
  });

  it("renders an attachment-only message without empty text", () => {
    const { container } = render(
      <ChatMessage role="user" content="" attachments={[image]} />,
    );
    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(container.querySelectorAll("br")).toHaveLength(0);
  });

  it("links stored attachments to their signed URL", () => {
    render(
      <ChatMessage
        role="user"
        content=""
        attachments={[
          {
            ...image,
            data: undefined,
            url: "https://worker.example/api/attachments/att/t/x?exp=1&sig=2",
          },
          {
            ...pdf,
            url: "https://worker.example/api/attachments/att/t/y?exp=1&sig=3",
          },
        ]}
      />,
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute(
      "href",
      "https://worker.example/api/attachments/att/t/x?exp=1&sig=2",
    );
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("img", { name: "receipt.png" })).toHaveAttribute(
      "src",
      "https://worker.example/api/attachments/att/t/x?exp=1&sig=2",
    );
  });

  it("falls back to a filename chip when the image bytes are gone", () => {
    render(
      <ChatMessage
        role="user"
        content=""
        attachments={[{ ...image, data: undefined }]}
      />,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("receipt.png")).toBeInTheDocument();
  });
});
