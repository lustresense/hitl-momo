"use client";

/**
 * Static page chrome around every screen: the single demo tape, <main id="screens"> and footer.
 * The brand lives on the level-select page itself (it was a header that bled behind the game).
 * When `uiR83()` is false (default 0), markup and behavior remain 100% identical to legacy.
 */
import type { ReactNode } from "react";
import { DevBanner } from "@/src/components/shared/DevBanner";
import { devTools, env, uiR83 } from "@/src/config/env";
import { NuiProvider } from "@/src/nui";

export interface AppShellProps {
  mode: "mock" | "partner";
  onboarding?: boolean;
  children: ReactNode;
}

export function AppShell({ mode, onboarding = false, children }: AppShellProps) {
  if (!uiR83()) {
    return (
      <div id="app" className={onboarding ? "onboarding-app" : undefined}>
        <DevBanner mode={mode} />
        <main id="screens">{children}</main>
        <footer className="app-footer" />
      </div>
    );
  }

  return (
    <div data-ui="r83" data-testid="r83-app-root">
      <NuiProvider devTools={devTools()} testHooks={env.testHooksEnabled}>
        <div id="app" className={onboarding ? "onboarding-app" : undefined}>
          <DevBanner mode={mode} />
          <main id="screens">{children}</main>
          <footer className="app-footer" />
        </div>
      </NuiProvider>
    </div>
  );
}
