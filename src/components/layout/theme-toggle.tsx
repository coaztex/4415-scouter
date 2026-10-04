"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const themes: Theme[] = ["system", "light", "dark"];
const key = "frc-scout-theme";

function applyTheme(theme: Theme) {
  if (theme === "system")
    document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = theme;
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      (window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false));
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#0d0d0f" : "#f7f6f3");
}

function useThemePreference() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(key);
      } catch {
        /* Storage can be unavailable. */
      }
      const value = themes.includes(saved as Theme)
        ? (saved as Theme)
        : "system";
      applyTheme(value);
      setTheme(value);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (theme !== "system" || !window.matchMedia) return;
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyTheme("system");
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, [theme]);
  function choose(next: Theme) {
    applyTheme(next);
    setTheme(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      /* Theme still applies this session. */
    }
  }
  return { theme, choose };
}

export function ThemeToggle() {
  const { theme, choose } = useThemePreference();
  function cycle() {
    choose(themes[(themes.indexOf(theme) + 1) % themes.length]);
  }
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${theme}. Change theme`}
      title="Cycle system, light, and dark theme"
      className="min-h-12 rounded-control border border-border bg-surface px-3 text-sm font-semibold text-foreground hover:bg-surface-subtle"
    >
      <span aria-hidden="true">◐</span>{" "}
      {theme[0].toUpperCase() + theme.slice(1)}
    </button>
  );
}

export function ThemeSelector() {
  const { theme, choose } = useThemePreference();
  return (
    <div
      role="group"
      aria-label="Theme preference"
      className="flex flex-wrap gap-2"
    >
      {themes.map((choice) => (
        <button
          key={choice}
          type="button"
          aria-pressed={theme === choice}
          onClick={() => choose(choice)}
          className={`min-h-12 rounded-control border px-4 py-2 text-sm font-semibold ${theme === choice ? "border-brand-primary bg-brand-primary text-on-brand-primary" : "border-border bg-surface text-foreground hover:bg-surface-subtle"}`}
        >
          {choice[0].toUpperCase() + choice.slice(1)}
        </button>
      ))}
    </div>
  );
}
