import "@testing-library/react";

// React 18 act() environment for jsdom-based component tests.
if (typeof process !== "undefined" && process.env?.VITEST_POOL_ID) {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
}
