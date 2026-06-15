import { ChatWidget } from "claudius-chat-widget";
import "claudius-chat-widget/style.css";

const pageStyle: React.CSSProperties = {
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  display: "grid",
  placeItems: "center",
  minHeight: "100vh",
  margin: 0,
};

export function App() {
  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: "32rem", padding: "2rem", textAlign: "center" }}>
        <h1>{{PROJECT_NAME}}</h1>
        <p>
          Edit <code>src/App.tsx</code> and configure the widget via its props. The
          launcher is in the corner.
        </p>
      </div>

      <ChatWidget
        apiUrl="{{API_URL}}"
        title="{{PROJECT_NAME}}"
        theme="{{THEME}}"
        accentColor="{{ACCENT_COLOR}}"
      />
    </main>
  );
}
