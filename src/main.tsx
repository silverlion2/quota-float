import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

const DesignPlayground = lazy(() => import("./components/DesignPlayground").then((module) => ({ default: module.DesignPlayground })));
const FocusPanelApp = lazy(() => import("./components/FocusPanelApp").then((module) => ({ default: module.FocusPanelApp })));

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

const params = new URLSearchParams(window.location.search);
const fallbackLanguage = navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";

function AppEntry() {
  if (params.has("focusPanel")) return <FocusPanelApp />;
  if (params.has("designer") || params.has("preview")) return <DesignPlayground />;
  return "__TAURI_INTERNALS__" in window ? <App /> : <BrowserPreview />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary language={fallbackLanguage} scope="app">
      <Suspense fallback={<div className="loading-card" role="status">{fallbackLanguage === "en" ? "Loading Quota Float…" : "正在加载 Quota Float…"}</div>}>
        <AppEntry />
      </Suspense>
    </ErrorBoundary>
  </React.StrictMode>,
);
