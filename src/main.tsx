import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DesignPlayground } from "./components/DesignPlayground";
import { FocusPanelApp } from "./components/FocusPanelApp";
import "./styles.css";

if (import.meta.env.VITE_WDIO === "1") {
  await import("@wdio/tauri-plugin");
}

function BrowserPreview() {
  return (
    <div className="browser-preview-shell">
      <div className="browser-widget-frame"><App /></div>
      <p className="browser-preview-note">Hover to expand · synthetic quota data</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("focusPanel")) return <FocusPanelApp />;
    if (params.has("designer") || params.has("preview")) return <DesignPlayground />;
    return "__TAURI_INTERNALS__" in window ? <App /> : <BrowserPreview />;
  })()}</React.StrictMode>,
);
