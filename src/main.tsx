import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DesignPlayground } from "./components/DesignPlayground";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has("designer") || params.has("preview") ? <DesignPlayground /> : <App />;
  })()}</React.StrictMode>,
);
