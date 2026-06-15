"use client";

import { ChatWidget } from "claudius-chat-widget";
import "claudius-chat-widget/style.css";

// ChatWidget uses browser APIs and React state, so it must run on the client.
export function ClaudiusWidget() {
  return (
    <ChatWidget
      apiUrl="{{API_URL}}"
      title="{{PROJECT_NAME}}"
      theme="{{THEME}}"
      accentColor="{{ACCENT_COLOR}}"
    />
  );
}
