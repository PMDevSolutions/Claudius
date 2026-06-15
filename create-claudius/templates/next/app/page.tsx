import { ClaudiusWidget } from "./ClaudiusWidget";

export default function Home() {
  return (
    <main
      style={{
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        display: "grid",
        placeItems: "center",
        minHeight: "100vh",
      }}
    >
      <div style={{ maxWidth: "32rem", padding: "2rem", textAlign: "center" }}>
        <h1>{{PROJECT_NAME}}</h1>
        <p>
          Edit <code>app/ClaudiusWidget.tsx</code> to configure the widget. The launcher
          is in the corner.
        </p>
      </div>

      <ClaudiusWidget />
    </main>
  );
}
