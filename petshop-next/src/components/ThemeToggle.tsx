"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  function toggleTheme() {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("petshop-theme", nextTheme);
    setTheme(nextTheme);
  }

  return <button aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} className="themeToggle" onClick={toggleTheme} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} type="button">
    <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
  </button>;
}
