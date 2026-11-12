import { describe, expect, it } from "vitest";
import { busyPercent, delegateReasonText, switchStateText } from "@/src/components/nui-lab/lab-metrics";

describe("busyPercent (estimated share of the main thread spent in detection)", () => {
  it("is null before the first detection", () => {
    expect(busyPercent(null, 0)).toBeNull();
  });

  it("is average duration times rate: 20 ms at 10 Hz is 20 %", () => {
    expect(busyPercent(20, 10)).toBeCloseTo(20, 6);
  });

  it("is 0 when no detection started in the last second", () => {
    expect(busyPercent(20, 0)).toBe(0);
  });

  it("never goes above 100 %", () => {
    expect(busyPercent(200, 17)).toBe(100);
  });
});

describe("delegateReasonText", () => {
  it("explains each delegate reason in plain Indonesian", () => {
    expect(delegateReasonText("gpu")).toBe("GPU tersedia dan dipakai");
    expect(delegateReasonText("gpu-failed")).toBe("GPU gagal dibuka, dipakai CPU cadangan");
    expect(delegateReasonText("software-renderer")).toBe("Tidak ada GPU, browser memakai renderer perangkat lunak");
    expect(delegateReasonText("slow-gpu")).toBe("GPU terlalu lambat, pindah ke CPU");
  });

  it("shows a dash before any landmarker exists", () => {
    expect(delegateReasonText(null)).toBe("—");
  });
});

describe("switchStateText", () => {
  it("says when nothing is switching", () => {
    expect(switchStateText("none", null)).toBe("tidak ada pindah");
  });

  it("says while the CPU model is loading", () => {
    expect(switchStateText("rebuilding", null)).toBe("sedang pindah ke CPU…");
  });

  it("says when the switch to CPU is done", () => {
    expect(switchStateText("switched", null)).toBe("sudah pindah ke CPU");
  });

  it("says the GPU is kept after a failed switch, with the error", () => {
    expect(switchStateText("failed", "out of memory")).toBe("gagal pindah ke CPU, tetap pakai GPU (out of memory)");
  });

  it("keeps the failed text short when there is no error message", () => {
    expect(switchStateText("failed", null)).toBe("gagal pindah ke CPU, tetap pakai GPU");
  });
});
