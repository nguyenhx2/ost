import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/tokens.css";
import "./styles/base.css";
import App from "./App";
import { RegionSelectView } from "./views/RegionSelectView";
import { RegionPreviewView } from "./views/RegionPreviewView";

/**
 * Window routing: every Tauri window loads the same bundle; the `view` query
 * param (set by src-tauri/src/shell/region.rs when it creates the window)
 * picks the surface to render.
 */
function selectView(): React.ReactElement {
  const view = new URLSearchParams(window.location.search).get("view");
  switch (view) {
    case "region-select":
      return <RegionSelectView />;
    case "region-preview":
      return <RegionPreviewView />;
    default:
      return <App />;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{selectView()}</React.StrictMode>,
);
