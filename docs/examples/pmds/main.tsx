import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ChatWidget } from "./components/ChatWidget";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ChatWidget
      apiUrl="http://localhost:8787"
      title="PMDS Chat"
      subtitle="Ask me anything about our services"
      welcomeMessage="Hi! I'm Paul's assistant. Ask me about web development services, pricing, or anything else. How can I help?"
      placeholder="Ask me anything about PMDS..."
    />
  </StrictMode>
);
