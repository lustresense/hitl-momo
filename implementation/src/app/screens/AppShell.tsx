/**
 * Static page chrome around every screen: brand header, dev banner, <main id="screens"> and footer.
 */
import type { ReactNode } from "react";
import { DevBanner } from "@/src/components/shared/DevBanner";

export interface AppShellProps {
  mode: "mock" | "partner";
  onboarding?: boolean;
  children: ReactNode;
}

export function AppShell({ mode, onboarding = false, children }: AppShellProps) {
  return (
    <div id="app" className={onboarding ? "onboarding-app" : undefined}>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Sketchbook Universe</span>
        </div>
        <DevBanner mode={mode} />
      </header>
      <main id="screens">{children}</main>
      <footer className="app-footer" />
    </div>
  );
}
