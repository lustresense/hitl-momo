import { describe, expect, it } from "vitest";
import {
  BUBBLE_REPLACE_MS,
  CARD_READ_MS,
  CHROME_SELECTOR,
  CURSOR_PENCIL_OFFSET_X,
  CURSOR_PENCIL_OFFSET_Y,
  CURSOR_PENCIL_SIZE_PX,
  DRAG_START_PX,
  ERASER_DIAMETER_PX,
  ERASER_STROKE_PX,
  FIGURE_FPS,
  GRAIN_BASE_FREQ,
  GRAIN_OCTAVES,
  GRAIN_TILE_PX,
  GUESS_IDLE_MS,
  HOLD_MS_DECISION,
  HOLD_MS_DEFAULT,
  HOLD_MS_PLACE,
  JOY_BASE,
  JOY_DEADZONE_PX,
  JOY_FLICK_COOLDOWN_MS,
  JOY_FLICK_UP_PX,
  JOY_FLICK_WINDOW_MS,
  JOY_GAIN,
  JOY_SPAN_PX,
  LEGEND_BOTTOM_PX,
  LEGEND_HIDE_MS,
  MOVE_CANCEL_PX,
  MUMBLE_POLL_MS,
  NAME_LISTEN_MS,
  NAME_MAX_CHARS,
  NAME_MAX_WORDS,
  OWNER_ICON_ACCENT_HEX,
  OWNER_ICON_COUNT,
  OWNER_ICON_STROKE_WIDTH,
  OWNER_ICON_VIEWBOX,
  PLACE_RING_DELAY_MS,
  PROVISIONAL_MS,
  R1_ANCHOR_LANDMARK,
  R1_CLICK_ROLLBACK_MS,
  R1_COMPUTE_WIDTH_PX,
  R1_CONTROL_BOX,
  R1_DEADZONE_PX,
  R1_DISPLAY_TAU_MS,
  R1_HOVER_LOOKBACK_MS,
  R1_NIB_LANDMARK,
  R1_NIB_ONE_EURO_BETA,
  R1_NIB_ONE_EURO_MIN_CUTOFF,
  R1_NIB_ROLLBACK_MS,
  R1_ONE_EURO_BETA,
  R1_ONE_EURO_BETA_PINCH,
  R1_ONE_EURO_D_CUTOFF,
  R1_ONE_EURO_MIN_CUTOFF,
  R1_PINCH_COOLDOWN_MS,
  R1_PINCH_ENTER_FRAMES,
  R1_PINCH_ENTER_R,
  R1_PINCH_HOLD_R,
  R1_PINCH_RELEASE_MIN_MS,
  R1_REACQUIRE_OPEN_FRAMES,
  R1_ROLLBACK_WINDOW_MS,
  R1_STICKY_HOVER_PAD_PX,
  R1_T_GAP_MAX_MS,
  R1_T_GAP_MIN_MS,
  R1_TARGET_GAP_PX,
  R1_TARGET_MIN_PX,
  RING_DRAIN_RATIO,
  RING_DT_CAP_MS,
  SOURCE_ARBITER_WINDOW_MS,
  STAMP_THROW_MS,
  STICKER_FLICK_UP_PX,
  STICKER_FLICK_WINDOW_MS,
  STICKER_RING_MS,
  TAP_JUMP_MS,
  TAP_MAX_MOVE_PX,
  THROW_TRAVEL,
  TUTORIAL_TOOLS_REQUIRED,
} from "@/src/nui/core";
import {
  CONTROL_BOX,
  CLICK_ROLLBACK_MS,
  DISPLAY_TAU_MS,
  HOVER_LOOKBACK_MS,
  NIB_BUFFER_MS,
  NIB_LANDMARK_INDEX,
  NIB_ONE_EURO,
  NIB_ROLLBACK_MS,
  PINCH_COOLDOWN_MS,
  PINCH_ENTER_FRAMES,
  PINCH_ENTER_R,
  PINCH_HOLD_R,
  PINCH_RELEASE_MIN_MS,
  POINTER_BETA_PINCH,
  POINTER_COMPUTE_WIDTH,
  POINTER_DEADZONE_PX,
  POINTER_LANDMARK_INDEX,
  POINTER_ONE_EURO,
  REACQUIRE_OPEN_FRAMES,
  ROLLBACK_WINDOW_MS,
  T_GAP_MAX_MS,
  T_GAP_MIN_MS,
} from "@/src/nui/sources/hand";
import {
  NUI_DEV_COPY,
  NUI_HAND_STATUS,
  NUI_LEGEND,
  NUI_RING_COPY,
  NUI_RULE_CAPTIONS,
  ringAriaLabel,
  ruleCaption,
} from "@/src/domain/copy/nui";

describe("Lampiran A & R1 parity constants", () => {
  it("matches every sandbox r8.3 parity value (plus O-5 and O-14)", () => {
    expect(MOVE_CANCEL_PX).toBe(26);
    expect([HOLD_MS_DEFAULT, HOLD_MS_DECISION, HOLD_MS_PLACE]).toEqual([1000, 2000, 1500]);
    expect(RING_DRAIN_RATIO).toBe(0.5);
    expect(RING_DT_CAP_MS).toBe(50);
    expect([JOY_DEADZONE_PX, JOY_BASE, JOY_SPAN_PX, JOY_GAIN]).toEqual([14, 0.35, 110, 0.65]);
    expect([TAP_JUMP_MS, TAP_MAX_MOVE_PX]).toEqual([230, 10]);
    expect([JOY_FLICK_UP_PX, JOY_FLICK_WINDOW_MS, JOY_FLICK_COOLDOWN_MS]).toEqual([40, 140, 420]);
    expect([STICKER_FLICK_UP_PX, STICKER_FLICK_WINDOW_MS]).toEqual([50, 160]);
    expect([DRAG_START_PX, PLACE_RING_DELAY_MS]).toEqual([12, 700]);
    expect([STAMP_THROW_MS, THROW_TRAVEL, STICKER_RING_MS]).toEqual([1200, 0.6, 1000]);
    expect([GUESS_IDLE_MS, PROVISIONAL_MS, MUMBLE_POLL_MS]).toEqual([1000, 500, 100]);
    expect([CARD_READ_MS, TUTORIAL_TOOLS_REQUIRED]).toEqual([3333, 5]);
    expect([CURSOR_PENCIL_OFFSET_X, CURSOR_PENCIL_OFFSET_Y, CURSOR_PENCIL_SIZE_PX]).toEqual([-7, -29, 36]);
    expect([ERASER_DIAMETER_PX, ERASER_STROKE_PX]).toEqual([44, 2.5]);
    expect([LEGEND_BOTTOM_PX, LEGEND_HIDE_MS]).toEqual([136, 7000]);
    expect([BUBBLE_REPLACE_MS, FIGURE_FPS]).toEqual([200, 30]);
    expect([GRAIN_TILE_PX, GRAIN_BASE_FREQ, GRAIN_OCTAVES]).toEqual([256, 0.65, 3]);
    expect([NAME_LISTEN_MS, NAME_MAX_WORDS, NAME_MAX_CHARS]).toEqual([7000, 3, 24]);
    expect([OWNER_ICON_COUNT, OWNER_ICON_VIEWBOX, OWNER_ICON_STROKE_WIDTH, OWNER_ICON_ACCENT_HEX]).toEqual([
      39,
      48,
      2.6,
      "#E86435",
    ]);
    expect(SOURCE_ARBITER_WINDOW_MS).toBe(500);
    expect(CHROME_SELECTOR).toBe("#skipbar,#gate,#replay,#hand-legend,.name-typelink,#name-type,[data-nui-off]");
  });

  it("matches every R1 cursor recipe value (PLAN §5.3.4)", () => {
    expect(R1_ANCHOR_LANDMARK).toBe(5);
    expect(R1_COMPUTE_WIDTH_PX).toBe(1280);
    expect([R1_ONE_EURO_MIN_CUTOFF, R1_ONE_EURO_BETA, R1_ONE_EURO_BETA_PINCH, R1_ONE_EURO_D_CUTOFF]).toEqual([
      1.0, 0.01, 0.05, 1.0,
    ]);
    expect(R1_DEADZONE_PX).toBe(4);
    expect(R1_CONTROL_BOX).toEqual({ x0: 0.12, x1: 0.88, y0: 0.1, y1: 0.8 });
    expect(R1_DISPLAY_TAU_MS).toBe(35);
    expect([
      R1_PINCH_ENTER_R,
      R1_PINCH_HOLD_R,
      R1_PINCH_ENTER_FRAMES,
      R1_PINCH_RELEASE_MIN_MS,
      R1_PINCH_COOLDOWN_MS,
    ]).toEqual([0.3, 0.42, 2, 150, 250]);
    expect([R1_ROLLBACK_WINDOW_MS, R1_CLICK_ROLLBACK_MS, R1_HOVER_LOOKBACK_MS, R1_NIB_ROLLBACK_MS]).toEqual([
      600, 200, 400, 200,
    ]);
    expect([R1_T_GAP_MIN_MS, R1_T_GAP_MAX_MS, R1_REACQUIRE_OPEN_FRAMES]).toEqual([250, 500, 2]);
    expect([R1_TARGET_MIN_PX, R1_TARGET_GAP_PX, R1_STICKY_HOVER_PAD_PX]).toEqual([64, 24, 24]);
    expect([R1_NIB_LANDMARK, R1_NIB_ONE_EURO_MIN_CUTOFF, R1_NIB_ONE_EURO_BETA]).toEqual([8, 1.5, 0.03]);
  });

  it("re-exports single-source R1 constants in sources/hand/* without drift (SEDANG-5)", () => {
    expect(POINTER_LANDMARK_INDEX).toBe(R1_ANCHOR_LANDMARK);
    expect(POINTER_COMPUTE_WIDTH).toBe(R1_COMPUTE_WIDTH_PX);
    expect(POINTER_ONE_EURO).toEqual({
      minCutoff: R1_ONE_EURO_MIN_CUTOFF,
      beta: R1_ONE_EURO_BETA,
      dCutoff: R1_ONE_EURO_D_CUTOFF,
      maxGapMs: R1_T_GAP_MAX_MS,
    });
    expect(POINTER_BETA_PINCH).toBe(R1_ONE_EURO_BETA_PINCH);
    expect(POINTER_DEADZONE_PX).toBe(R1_DEADZONE_PX);
    expect(CONTROL_BOX).toBe(R1_CONTROL_BOX);
    expect(DISPLAY_TAU_MS).toBe(R1_DISPLAY_TAU_MS);
    expect([PINCH_ENTER_R, PINCH_HOLD_R, PINCH_ENTER_FRAMES, PINCH_RELEASE_MIN_MS, PINCH_COOLDOWN_MS]).toEqual([
      R1_PINCH_ENTER_R,
      R1_PINCH_HOLD_R,
      R1_PINCH_ENTER_FRAMES,
      R1_PINCH_RELEASE_MIN_MS,
      R1_PINCH_COOLDOWN_MS,
    ]);
    expect([ROLLBACK_WINDOW_MS, CLICK_ROLLBACK_MS, HOVER_LOOKBACK_MS]).toEqual([
      R1_ROLLBACK_WINDOW_MS,
      R1_CLICK_ROLLBACK_MS,
      R1_HOVER_LOOKBACK_MS,
    ]);
    expect([T_GAP_MIN_MS, T_GAP_MAX_MS, REACQUIRE_OPEN_FRAMES]).toEqual([
      R1_T_GAP_MIN_MS,
      R1_T_GAP_MAX_MS,
      R1_REACQUIRE_OPEN_FRAMES,
    ]);
    expect([NIB_LANDMARK_INDEX, NIB_ROLLBACK_MS, NIB_BUFFER_MS]).toEqual([
      R1_NIB_LANDMARK,
      R1_NIB_ROLLBACK_MS,
      R1_ROLLBACK_WINDOW_MS,
    ]);
    expect(NIB_ONE_EURO).toEqual({
      minCutoff: R1_NIB_ONE_EURO_MIN_CUTOFF,
      beta: R1_NIB_ONE_EURO_BETA,
      dCutoff: R1_ONE_EURO_D_CUTOFF,
      maxGapMs: R1_T_GAP_MAX_MS,
    });
  });
});

describe("NUI copy (src/domain/copy/nui.ts)", () => {
  it("matches sandbox hand.js legend text verbatim and provides camera + non-dev variants (SEDANG-1)", () => {
    expect(NUI_LEGEND.simOnSegments.map((s) => s.text).join("")).toBe(NUI_LEGEND.simOnPlain);
    expect(NUI_LEGEND.simOnPlain).toBe(
      "Simulasi tangan · mouse = tangan (lihat kartu kamera) · tahan klik = cubit-tahan · tahan lalu geser = tarik · kursor cuma ada di kanvas · H = mouse biasa",
    );
    expect(NUI_LEGEND.simOnBaseSegments.map((s) => s.text).join("") + NUI_LEGEND.simOnDevSuffix).toBe(
      NUI_LEGEND.simOnPlain,
    );
    expect(NUI_LEGEND.simOffSegments.map((s) => s.text).join("")).toBe(NUI_LEGEND.simOffPlain);
    expect(NUI_LEGEND.simOffPlain).toBe("Simulasi tangan mati · kursor mouse biasa · H = nyalakan lagi");
    expect(NUI_LEGEND.handSegments.map((s) => s.text).join("")).toBe(NUI_LEGEND.handPlain);
    expect(NUI_LEGEND.handPlain).toBe(
      "Tangan kamera aktif · cubit dan tahan = pilih · cubit lalu geser = tarik · kursor cuma ada di kanvas",
    );
  });

  it("formats ring aria label and rule captions verbatim from ui.js and hand.css", () => {
    expect(NUI_RING_COPY.defaultLabel).toBe("Cubit");
    expect(NUI_RING_COPY.lockedLabel).toBe("Coba dulu, ya");
    expect(ringAriaLabel("Ayo")).toBe("Ayo, cubit dan tahan");
    expect(ringAriaLabel()).toBe(", cubit dan tahan");

    expect(ruleCaption("A", false)).toBe(NUI_RULE_CAPTIONS.A);
    expect(ruleCaption("A", true)).toBe("cubit dan tahan di mana aja");
    expect(ruleCaption("B", false)).toBe("dekatkan tangan ke sini");
    expect(ruleCaption("B", true)).toBe("cubit dan tahan");
    expect(ruleCaption("D", false)).toBe("tunjuk, cubit, tahan");
    expect(ruleCaption("D", true)).toBe("tunjuk, cubit, tahan");
  });

  it("exposes non-empty hand status and dev fallback copy", () => {
    for (const value of [...Object.values(NUI_HAND_STATUS), ...Object.values(NUI_DEV_COPY)]) {
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });
});
