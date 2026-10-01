import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "../public/operator.css";
import "../../../packages/shared-ui/tokens.css";
import "../../../packages/shared-ui/components.css";
import "../public/operator-1.8.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
