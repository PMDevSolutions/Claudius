import { createRoot } from "react-dom/client";
import { ChatWidget } from "./components/ChatWidget";
import "./styles.css";

interface ClaudiusConfig {
  apiUrl: string;
  title?: string;
  subtitle?: string;
  welcomeMessage?: string;
  placeholder?: string;
  persistMessages?: boolean;
  theme?: "light" | "dark" | "auto";
  accentColor?: string;
}

declare global {
  interface Window {
    ClaudiusConfig?: ClaudiusConfig;
  }
}

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
      theme={config.theme}
      accentColor={config.accentColor}
    />
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
