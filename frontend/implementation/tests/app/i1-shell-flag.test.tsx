// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import DevNuiPage from "@/app/dev/nui/page";
import { AppShell } from "@/src/app/screens/AppShell";
import { devTools, env, uiR83 } from "@/src/config/env";
import { useNuiStatus } from "@/src/nui";

interface SavedEnv {
  uiR83: string | undefined;
  devTools: string | undefined;
  testHooks: string | undefined;
}

function NuiStatusProbe() {
  const status = useNuiStatus();
  return (
    <span data-testid="nui-probe" data-dev-tools={String(status.devTools)}>
      nui-mounted
    </span>
  );
}

describe("I-1 feature flags, AppShell, and /dev/nui wiring", () => {
  let saved: SavedEnv;

  beforeEach(() => {
    saved = {
      uiR83: process.env.NEXT_PUBLIC_UI_R83,
      devTools: process.env.NEXT_PUBLIC_DEV_TOOLS,
      testHooks: process.env.NEXT_PUBLIC_TEST_HOOKS,
    };
    delete process.env.NEXT_PUBLIC_UI_R83;
    delete process.env.NEXT_PUBLIC_DEV_TOOLS;
    delete process.env.NEXT_PUBLIC_TEST_HOOKS;
  });

  afterEach(() => {
    cleanup();
    if (saved.uiR83 === undefined) delete process.env.NEXT_PUBLIC_UI_R83;
    else process.env.NEXT_PUBLIC_UI_R83 = saved.uiR83;
    if (saved.devTools === undefined) delete process.env.NEXT_PUBLIC_DEV_TOOLS;
    else process.env.NEXT_PUBLIC_DEV_TOOLS = saved.devTools;
    if (saved.testHooks === undefined) delete process.env.NEXT_PUBLIC_TEST_HOOKS;
    else process.env.NEXT_PUBLIC_TEST_HOOKS = saved.testHooks;
    document.documentElement.className = "";
    delete window.__skbNui;
  });

  describe("uiR83() and devTools() flags", () => {
    it("default to false when unset or '0'", () => {
      expect(uiR83()).toBe(false);
      expect(env.uiR83).toBe(false);
      expect(devTools()).toBe(false);
      expect(env.devTools).toBe(false);

      process.env.NEXT_PUBLIC_UI_R83 = "0";
      process.env.NEXT_PUBLIC_DEV_TOOLS = "0";
      expect(uiR83()).toBe(false);
      expect(env.uiR83).toBe(false);
      expect(devTools()).toBe(false);
      expect(env.devTools).toBe(false);

      process.env.NEXT_PUBLIC_UI_R83 = "false";
      process.env.NEXT_PUBLIC_DEV_TOOLS = "";
      expect(uiR83()).toBe(false);
      expect(devTools()).toBe(false);
    });

    it("enable when set to '1' or 'true'", () => {
      process.env.NEXT_PUBLIC_UI_R83 = "1";
      process.env.NEXT_PUBLIC_DEV_TOOLS = "1";
      expect(uiR83()).toBe(true);
      expect(env.uiR83).toBe(true);
      expect(devTools()).toBe(true);
      expect(env.devTools).toBe(true);

      process.env.NEXT_PUBLIC_UI_R83 = "true";
      process.env.NEXT_PUBLIC_DEV_TOOLS = "true";
      expect(uiR83()).toBe(true);
      expect(env.uiR83).toBe(true);
      expect(devTools()).toBe(true);
      expect(env.devTools).toBe(true);
    });
  });

  describe("AppShell flag gating", () => {
    it("renders exact legacy markup without data-ui='r83' or NuiProvider when flag is 0", () => {
      process.env.NEXT_PUBLIC_UI_R83 = "0";
      const { container } = render(
        <AppShell mode="mock" onboarding>
          <p data-testid="legacy-child">Layar lama</p>
        </AppShell>,
      );

      expect(container.querySelector('[data-ui="r83"]')).toBeNull();
      const root = container.firstElementChild;
      expect(root?.tagName).toBe("DIV");
      expect(root?.id).toBe("app");
      expect(root?.className).toBe("onboarding-app");
      expect(root?.getAttribute("data-ui")).toBeNull();
      expect(root?.children.length).toBe(3);
      expect(root?.children[1]?.tagName).toBe("MAIN");
      expect(root?.children[1]?.id).toBe("screens");
      expect(root?.children[2]?.tagName).toBe("FOOTER");
      expect(root?.children[2]?.className).toBe("app-footer");
      expect(screen.getByTestId("legacy-child").textContent).toBe("Layar lama");
      expect(document.documentElement.classList.contains("hand-sim")).toBe(false);
      expect(window.__skbNui).toBeUndefined();
    });

    it("wraps shell in data-ui='r83' and NuiProvider when flag is 1", () => {
      process.env.NEXT_PUBLIC_UI_R83 = "1";
      process.env.NEXT_PUBLIC_DEV_TOOLS = "1";
      process.env.NEXT_PUBLIC_TEST_HOOKS = "1";

      const { container } = render(
        <AppShell mode="partner">
          <NuiStatusProbe />
        </AppShell>,
      );

      const wrapper = container.querySelector('[data-ui="r83"]');
      expect(wrapper).not.toBeNull();
      expect(wrapper?.querySelector("#app")).not.toBeNull();
      expect(wrapper?.querySelector("main#screens")).not.toBeNull();

      const probe = screen.getByTestId("nui-probe");
      expect(probe.textContent).toBe("nui-mounted");
      expect(probe.getAttribute("data-dev-tools")).toBe("true");
      expect(window.__skbNui).toBeDefined();
      expect(typeof window.__skbNui?.push).toBe("function");
    });

    it("does not expose window.__skbNui when uiR83=1 and NEXT_PUBLIC_TEST_HOOKS=0", () => {
      process.env.NEXT_PUBLIC_UI_R83 = "1";
      process.env.NEXT_PUBLIC_TEST_HOOKS = "0";

      render(
        <AppShell mode="mock">
          <NuiStatusProbe />
        </AppShell>,
      );

      expect(screen.getByTestId("nui-probe").getAttribute("data-dev-tools")).toBe("false");
      expect(window.__skbNui).toBeUndefined();
    });
  });

  describe("/dev/nui route gating", () => {
    it("renders only 'tidak tersedia' without NuiHarness when devTools=0", () => {
      process.env.NEXT_PUBLIC_DEV_TOOLS = "0";
      const { container } = render(<DevNuiPage />);

      expect(container.textContent?.trim()).toBe("tidak tersedia");
      expect(screen.queryByTestId("r83-nui-harness")).toBeNull();
      expect(container.querySelector('[data-ui="r83"]')).toBeNull();
      expect(container.querySelector("#lc-paper-overlay")).toBeNull();
    });

    it("renders NuiHarness and PaperOverlay inside data-ui='r83' when devTools=1", () => {
      process.env.NEXT_PUBLIC_DEV_TOOLS = "1";
      const { container } = render(<DevNuiPage />);

      const root = container.querySelector('[data-ui="r83"]');
      expect(root).not.toBeNull();
      const harness = screen.getByTestId("r83-nui-harness");
      expect(root?.contains(harness)).toBe(true);
      expect(root?.querySelector("#lc-defs")).not.toBeNull();
      expect(root?.querySelector("#lc-paper-overlay")).not.toBeNull();
      expect(screen.queryByText("tidak tersedia")).toBeNull();
    });
  });
});
