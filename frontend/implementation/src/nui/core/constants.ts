/**
 * Konstanta paritas r8.3 (PLAN Lampiran A & §5.3.4 R1).
 * Sumber sandbox: proto-html/r83/shared/hand.js, hand.css, ui.js, lc.js,
 * kartu/kartu.js, level/{canvas,place,stamp}.js, onboarding/cam/index.html.
 */

/** hand.js:23 selektor elemen chrome (tetap mouse/sentuh native). */
export const CHROME_SELECTOR = "#skipbar,#gate,#replay,#hand-legend,.name-typelink,#name-type,[data-nui-off]";

/** PLAN §5.3.1 jendela sumber aktif terakhir di SourceArbiter (ms). */
export const SOURCE_ARBITER_WINDOW_MS = 500;

/** hand.js:25 cubitan bergeser lebih dari ini = tarikan, ring berhenti. */
export const MOVE_CANCEL_PX = 26;

/** hand.js:215 msFor. */
export const HOLD_MS_DEFAULT = 1000;
export const HOLD_MS_DECISION = 2000;
export const HOLD_MS_PLACE = 1500;
export const HOLD_DECISION_PREFIXES: readonly string[] = ["Tebak Gambarku", "Kembali ke sampul", "Ya,"];
export const HOLD_PLACE_PREFIXES: readonly string[] = ["Taruh di sini"];

/** O-5: turun = 0,5x kecepatan isi (sandbox hand.js:125 memakai 1,5x). */
export const RING_DRAIN_RATIO = 0.5;
/** hand.js:110. */
export const RING_DT_CAP_MS = 50;
/** hand.js:67-69 target baru harus lebih tua dari ini saat cubit mulai. */
export const TARGET_MIN_AGE_MS = 30;
/** hand.js:61 bobot jarak ke pusat untuk pemecah seri. */
export const DIST_CENTER_WEIGHT = 0.001;
/** Nilai tak hingga untuk pencarian terdekat (hand.js:63 memakai 1e9). */
export const NEAREST_INIT = 1e9;
/** Posisi pointer awal di luar layar (hand.js:27). */
export const POINTER_OFFSCREEN = -1e4;
/** hand.js:129 durasi kelas nui-fired. */
export const FIRED_FLASH_MS = 500;
/** hand.js:32, ui.js:122 jari-jari SVG ring utama dan lencana. */
export const RING_SVG_RADIUS_PX = 30;
export const BADGE_SVG_RADIUS_PX = 16;

/** hand.js:180 joystick. */
export const JOY_DEADZONE_PX = 14;
export const JOY_BASE = 0.35;
export const JOY_SPAN_PX = 110;
export const JOY_GAIN = 0.65;
/** hand.js:171,176 tap = lompat. */
export const TAP_JUMP_MS = 230;
export const TAP_MAX_MOVE_PX = 10;
/** hand.js:172-173 sentil joystick. */
export const JOY_FLICK_UP_PX = 40;
export const JOY_FLICK_WINDOW_MS = 140;
export const JOY_FLICK_COOLDOWN_MS = 420;
/** hand.js flick() sentil stiker. */
export const STICKER_FLICK_UP_PX = 50;
export const STICKER_FLICK_WINDOW_MS = 160;

/** place.js:82 tarik relatif. */
export const DRAG_START_PX = 12;
/** place.js:71 jeda sebelum ring "Taruh di sini" muncul setelah diam. */
export const PLACE_RING_DELAY_MS = 700;

/** stamp.js:11. */
export const STAMP_THROW_MS = 1200;
export const THROW_TRAVEL = 0.6;
/** Efektif setelah msFor (STAMP_HOLD_MS 2000 di stamp.js:11 dipotong menjadi 1000). */
export const STICKER_RING_MS = 1000;

/** O-14, canvas.js:9 waktu diam sebelum Momo bertanya & ring muncul. */
export const GUESS_IDLE_MS = 1000;
/** canvas.js:9 hanya dipakai bila O-13 = nyala. */
export const PROVISIONAL_MS = 500;
export const MUMBLE_POLL_MS = 100;

/** kartu.js:15,148-151 gerbang baca dan jumlah alat wajib di kartu tutorial. */
export const CARD_READ_MS = 3333;
export const TUTORIAL_TOOLS_REQUIRED = 5;

/** hand.css:11,18-19 kursor kanvas (aturan D). */
export const HAND_CURSOR_RING_PX = 28;
export const CURSOR_PENCIL_OFFSET_X = -7;
export const CURSOR_PENCIL_OFFSET_Y = -29;
export const CURSOR_PENCIL_SIZE_PX = 36;
export const ERASER_DIAMETER_PX = 44;
export const ERASER_RADIUS_PX = 22;
export const ERASER_STROKE_PX = 2.5;

/** hand.css:64, hand.js:207,224 legenda simulasi tangan. */
export const LEGEND_BOTTOM_PX = 136;
export const LEGEND_HIDE_MS = 7000;
export const LEGEND_AUTO_DELAY_MS = 600;

/** ui.js:154-158 interval hitung ulang penempatan bubble/ring. */
export const BUBBLE_REPLACE_MS = 200;
/** kartu.js:39-41 batas fps render figur Thinman. */
export const FIGURE_FPS = 30;

/** lc.js:22-33, lc.css:234 tile grain kertas statis. */
export const GRAIN_TILE_PX = 256;
export const GRAIN_BASE_FREQ = 0.65;
export const GRAIN_OCTAVES = 3;

/** onboarding/cam/index.html:1125-1130,1174 input nama. */
export const NAME_LISTEN_MS = 7000;
export const NAME_MAX_WORDS = 3;
export const NAME_MAX_CHARS = 24;

/** Lampiran A spesifikasi ikon Owner (icons.js). */
export const OWNER_ICON_COUNT = 39;
export const OWNER_ICON_VIEWBOX = 48;
export const OWNER_ICON_STROKE_WIDTH = 2.6;
export const OWNER_ICON_ACCENT_HEX = "#E86435";

/** Konstanta referensi resep R1 (PLAN §5.3.4, berawalan R1_ agar tidak bentrok dengan sources/hand). */
export const R1_ANCHOR_LANDMARK = 5;
export const R1_COMPUTE_WIDTH_PX = 1280;
export const R1_ONE_EURO_MIN_CUTOFF = 1.0;
export const R1_ONE_EURO_BETA = 0.01;
export const R1_ONE_EURO_BETA_PINCH = 0.05;
export const R1_ONE_EURO_D_CUTOFF = 1.0;
export const R1_DEADZONE_PX = 4;
export const R1_CONTROL_BOX = { x0: 0.12, x1: 0.88, y0: 0.1, y1: 0.8 } as const;
export const R1_DISPLAY_TAU_MS = 35;
export const R1_PINCH_ENTER_R = 0.3;
export const R1_PINCH_HOLD_R = 0.42;
export const R1_PINCH_ENTER_FRAMES = 2;
export const R1_PINCH_RELEASE_MIN_MS = 150;
export const R1_PINCH_COOLDOWN_MS = 250;
export const R1_PINCH_STRENGTH_TOP_R = 0.5;
export const R1_PINCH_STRENGTH_SPAN_R = 0.2;
export const R1_ROLLBACK_WINDOW_MS = 600;
export const R1_CLICK_ROLLBACK_MS = 200;
export const R1_HOVER_LOOKBACK_MS = 400;
export const R1_T_GAP_MIN_MS = 250;
export const R1_T_GAP_MAX_MS = 500;
export const R1_T_GAP_MEDIAN_MULT = 3;
export const R1_REACQUIRE_OPEN_FRAMES = 2;
export const R1_NIB_LANDMARK = 8;
export const R1_NIB_ONE_EURO_MIN_CUTOFF = 1.5;
export const R1_NIB_ONE_EURO_BETA = 0.03;
export const R1_NIB_ROLLBACK_MS = 200;
export const R1_TARGET_MIN_PX = 64;
export const R1_TARGET_GAP_PX = 24;
export const R1_STICKY_HOVER_PAD_PX = 24;
