// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DevBanner } from "@/src/components/shared/DevBanner";

describe("DevBanner follows prediction provenance", () => {
  afterEach(cleanup);

  it("shows the demo tape for demo predictions", () => {
    render(<DevBanner mode="mock" />);
    expect(screen.getByText(/Mode demo/)).toBeTruthy();
  });

  it("labels model output as the partner model, never as the demo", () => {
    render(<DevBanner mode="partner" />);
    expect(screen.getByText(/model partner/)).toBeTruthy();
    expect(screen.queryByText(/Mode demo/)).toBeNull();
  });
});
