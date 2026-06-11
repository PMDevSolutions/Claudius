import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatWidget } from "../../components/ChatWidget";

function getRoot(container: HTMLElement): HTMLElement {
  return container.querySelector(".claudius-root") as HTMLElement;
}

function getDarkWrapper(container: HTMLElement): HTMLElement {
  return container.querySelector("[data-claudius-dark]") as HTMLElement;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ChatWidget theme prop", () => {
  it("applies a built-in theme's tokens by name", () => {
    const { container } = render(
      <ChatWidget apiUrl="https://test.example" theme="corporate" />,
    );
    const root = getRoot(container);
    expect(root.style.getPropertyValue("--cl-color-accent")).toBe("#1e3a5f");
    expect(root.style.getPropertyValue("--cl-radius-lg")).toBe("8px");
  });

  it("applies an inline theme object", () => {
    const { container } = render(
      <ChatWidget
        apiUrl="https://test.example"
        theme={{ colors: { accent: "#ff0066" }, radii: { lg: "0px" } }}
      />,
    );
    const root = getRoot(container);
    expect(root.style.getPropertyValue("--cl-color-accent")).toBe("#ff0066");
    expect(root.style.getPropertyValue("--cl-color-accent-dark")).toBe(
      "#ff0066",
    );
    expect(root.style.getPropertyValue("--cl-radius-lg")).toBe("0px");
  });

  it("keeps mode-only strings working with no token vars (existing API)", () => {
    const { container } = render(
      <ChatWidget apiUrl="https://test.example" theme="dark" />,
    );
    expect(getDarkWrapper(container).getAttribute("data-claudius-dark")).toBe(
      "true",
    );
    expect(getRoot(container).getAttribute("style")).toBeFalsy();
  });

  it("honors a theme object's colorScheme for dark mode", () => {
    const { container } = render(
      <ChatWidget
        apiUrl="https://test.example"
        theme={{ colorScheme: "dark", colors: { accent: "#222222" } }}
      />,
    );
    expect(getDarkWrapper(container).getAttribute("data-claudius-dark")).toBe(
      "true",
    );
  });

  it("lets accentColor override the theme accent in both modes", () => {
    const { container } = render(
      <ChatWidget
        apiUrl="https://test.example"
        theme="corporate"
        accentColor="#bada55"
      />,
    );
    const root = getRoot(container);
    expect(root.style.getPropertyValue("--cl-color-accent")).toBe("#bada55");
    expect(root.style.getPropertyValue("--cl-color-accent-dark")).toBe(
      "#bada55",
    );
  });

  it("fetches a theme from a URL and applies it", async () => {
    const theme = { colors: { accent: "#123456" } };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(theme),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      <ChatWidget
        apiUrl="https://test.example"
        theme="https://cdn.example/acme.theme.json"
      />,
    );

    await waitFor(() => {
      expect(
        getRoot(container).style.getPropertyValue("--cl-color-accent"),
      ).toBe("#123456");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cdn.example/acme.theme.json",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("falls back to defaults and logs when the theme URL fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );

    const { container } = render(
      <ChatWidget
        apiUrl="https://test.example"
        theme="https://cdn.example/missing.json"
      />,
    );

    await waitFor(() => {
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining("missing.json"),
        expect.anything(),
      );
    });
    expect(getRoot(container).style.getPropertyValue("--cl-color-accent")).toBe(
      "",
    );
  });

  it("rejects non-object theme JSON and keeps defaults", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(["not", "a", "theme"]),
      }),
    );

    const { container } = render(
      <ChatWidget
        apiUrl="https://test.example"
        theme="https://cdn.example/bad.json"
      />,
    );

    await waitFor(() => {
      expect(error).toHaveBeenCalled();
    });
    expect(getRoot(container).getAttribute("style")).toBeFalsy();
  });

  it("uses the fetched theme's colorScheme", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ colorScheme: "dark", colors: { accent: "#000" } }),
      }),
    );

    const { container } = render(
      <ChatWidget
        apiUrl="https://test.example"
        theme="https://cdn.example/darkish.json"
      />,
    );

    await waitFor(() => {
      expect(getDarkWrapper(container).getAttribute("data-claudius-dark")).toBe(
        "true",
      );
    });
  });
});
