import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ChatWidget } from "./components/ChatWidget";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ChatWidget apiUrl="http://localhost:8787" />
  </StrictMode>,
);
