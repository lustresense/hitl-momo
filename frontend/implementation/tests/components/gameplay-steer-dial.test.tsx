import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { SteerDial } from "@/src/components/game/SteerDial";
import {
  getSteerAngle,
  publishSteerAngle,
  resetSteerAngleForTest,
  subscribeSteerAngle,
} from "@/src/components/game/steer-reading";

afterEach(() => {
  cleanup();
  resetSteerAngleForTest();
});

describe("steer reading: the live finger angle shared with the bar", () => {
  it("starts with no reading", () => {
    expect(getSteerAngle()).toBeNull();
  });

  it("rounds to whole degrees and tells subscribers only when the rounded value changes", () => {
    let calls = 0;
    const off = subscribeSteerAngle(() => {
      calls++;
    });
    publishSteerAngle(60.2);
    expect(getSteerAngle()).toBe(60);
    publishSteerAngle(59.8); // rounds to 60 again: no notification
    expect(calls).toBe(1);
    publishSteerAngle(61);
    expect(calls).toBe(2);
    publishSteerAngle(null);
    expect(getSteerAngle()).toBeNull();
    expect(calls).toBe(3);
    off();
  });

  it("ignores NaN as no reading", () => {
    publishSteerAngle(Number.NaN);
    expect(getSteerAngle()).toBeNull();
  });
});

describe("SteerDial: a speedometer for the finger angle", () => {
  it("says the finger is not read yet when there is no reading", () => {
    render(<SteerDial />);
    const dial = screen.getByTestId("steer-dial");
    expect(dial.getAttribute("aria-label")).toContain("Telunjuk belum terbaca");
    expect(dial.querySelector("[data-testid='steer-needle']")).toBeNull();
  });

  it("names the zone the finger is in, in plain Indonesian", () => {
    render(<SteerDial />);
    act(() => publishSteerAngle(60));
    expect(screen.getByTestId("steer-dial").getAttribute("aria-label")).toContain("Lompat sambil ke kanan");
    expect(screen.getByText("Lompat sambil ke kanan")).toBeTruthy();
  });

  it("points the needle at the live angle and follows changes", () => {
    render(<SteerDial />);
    act(() => publishSteerAngle(120));
    const needle = screen.getByTestId("steer-needle");
    expect(needle.getAttribute("data-angle")).toBe("120");
    expect(screen.getByText("Lompat sambil ke kiri")).toBeTruthy();
    act(() => publishSteerAngle(10));
    expect(screen.getByTestId("steer-needle").getAttribute("data-angle")).toBe("10");
    expect(screen.getByText("Jalan ke kanan")).toBeTruthy();
  });

  it("names every zone: jump, walk left, stop", () => {
    render(<SteerDial />);
    act(() => publishSteerAngle(90));
    expect(screen.getByText("Lompat")).toBeTruthy();
    act(() => publishSteerAngle(170));
    expect(screen.getByText("Jalan ke kiri")).toBeTruthy();
    act(() => publishSteerAngle(-60));
    expect(screen.getByText("Thinman berhenti")).toBeTruthy();
  });

  it("is not a text label of a keyboard key", () => {
    const { container } = render(<SteerDial />);
    expect(container.textContent).not.toMatch(/\[|Spasi|WASD|panah/i);
  });
});
