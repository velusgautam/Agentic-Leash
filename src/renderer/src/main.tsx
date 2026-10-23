import "./index.css";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyAppearance, readAppearance } from "./appearance";
import { router } from "./router";

const dark = matchMedia("(prefers-color-scheme: dark)");
let source: "system" | "light" | "dark" = "system";
const applyTheme = () => {
  document.documentElement.classList.toggle("dark", source === "dark" || (source === "system" && dark.matches));
  applyAppearance(readAppearance());
};
applyTheme();
dark.addEventListener("change", applyTheme);
void window.leash.getTheme().then((theme) => {
  source = theme;
  applyTheme();
});
window.leash.onTheme((theme) => {
  source = theme;
  applyTheme();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
