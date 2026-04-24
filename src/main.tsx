import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

try {
  const raw = localStorage.getItem('flint-settings');
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed?.theme) {
      document.body.dataset.theme = parsed.theme;
    }
  }
} catch {
  // Ignore malformed local settings
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
