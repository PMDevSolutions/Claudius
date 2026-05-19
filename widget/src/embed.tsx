import { createRoot, Root } from "react-dom/client";
import { ChatWidget, WidgetPosition } from "./components/ChatWidget";
import "./styles.css";

interface ClaudiusConfig {
  apiUrl: string;
  title?: string;
  subtitle?: string;
  welcomeMessage?: string;
  placeholder?: string;
  persistMessages?: boolean;
  storageKeyPrefix?: string;
  requestTimeoutMs?: number;
  theme?: "light" | "dark" | "auto";
  accentColor?: string;
  position?: WidgetPosition;
}

declare global {
  interface Window {
    ClaudiusConfig?: ClaudiusConfig;
  }
}

// Script-based initialization (existing method)
function init() {
  const config = window.ClaudiusConfig;
  if (!config?.apiUrl) {
    console.error("[Claudius] Missing ClaudiusConfig.apiUrl");
    return;
  }

  const container = document.createElement("div");
  container.id = "claudius-chat-widget";
  document.body.appendChild(container);

  createRoot(container).render(
    <ChatWidget
      apiUrl={config.apiUrl}
      title={config.title}
      subtitle={config.subtitle}
      welcomeMessage={config.welcomeMessage}
      placeholder={config.placeholder}
      persistMessages={config.persistMessages}
      storageKeyPrefix={config.storageKeyPrefix}
      requestTimeoutMs={config.requestTimeoutMs}
      theme={config.theme}
      accentColor={config.accentColor}
      position={config.position}
    />,
  );
}

// Web Component wrapper for non-React sites
class ClaudiusChat extends HTMLElement {
  private root: Root | null = null;
  private container: HTMLDivElement | null = null;

  static get observedAttributes() {
    return [
      "api-url",
      "title",
      "subtitle",
      "welcome-message",
      "placeholder",
      "persist-messages",
      "storage-key-prefix",
      "request-timeout-ms",
      "theme",
      "accent-color",
      "position",
    ];
  }

  connectedCallback() {
    this.container = document.createElement("div");
    this.appendChild(this.container);
    this.root = createRoot(this.container);
    this.render();
  }

  disconnectedCallback() {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  attributeChangedCallback() {
    this.render();
  }

  private render() {
    if (!this.root) return;

    const apiUrl = this.getAttribute("api-url");
    if (!apiUrl) {
      console.error("[Claudius] Missing api-url attribute on <claudius-chat>");
      return;
    }

    const persistAttr = this.getAttribute("persist-messages");
    const persistMessages =
      persistAttr === null ? undefined : persistAttr !== "false";

    const timeoutAttr = this.getAttribute("request-timeout-ms");
    const requestTimeoutMs =
      timeoutAttr === null ? undefined : Number(timeoutAttr);

    this.root.render(
      <ChatWidget
        apiUrl={apiUrl}
        title={this.getAttribute("title") ?? undefined}
        subtitle={this.getAttribute("subtitle") ?? undefined}
        welcomeMessage={this.getAttribute("welcome-message") ?? undefined}
        placeholder={this.getAttribute("placeholder") ?? undefined}
        persistMessages={persistMessages}
        storageKeyPrefix={this.getAttribute("storage-key-prefix") ?? undefined}
        requestTimeoutMs={
          requestTimeoutMs !== undefined && Number.isFinite(requestTimeoutMs)
            ? requestTimeoutMs
            : undefined
        }
        theme={
          (this.getAttribute("theme") as "light" | "dark" | "auto") ?? undefined
        }
        accentColor={this.getAttribute("accent-color") ?? undefined}
        position={
          (this.getAttribute("position") as WidgetPosition) ?? undefined
        }
      />,
    );
  }
}

// Register web component
if (typeof customElements !== "undefined") {
  customElements.define("claudius-chat", ClaudiusChat);
}

// Auto-init with ClaudiusConfig
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Export for programmatic use
export { ClaudiusChat };
