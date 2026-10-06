"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );

  return (
    <button
      type="button"
      onClick={() => {
        const next = !dark;
        document.documentElement.classList.toggle("dark", next);
        localStorage.setItem("theme", next ? "dark" : "light");
      }}
      className={
        compact
          ? "rounded-full border border-border bg-surface p-2 text-foreground transition hover:border-primary"
          : "inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary"
      }
      aria-label="Cambiar entre modo claro y oscuro"
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
      {!compact && (dark ? "Modo claro" : "Modo oscuro")}
    </button>
  );
}
