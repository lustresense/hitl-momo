# Implementation Changelog

Code changes only. The root CHANGELOG.md remains the PA decision log.

## [0.0.3] - 2026-10-27

### Enhanced
- Dynamic tactile visual feedback: on-screen buttons (`← Kiri`, `Kanan →`, `↑ Lompat`) now reflect instantaneous `.is-pressed` state during touch/pointer hold and keyboard down.
- Stickman kinetics optimized: movement speed tuned to 200 px/s and jump impulse to 520 px/s with responsive air control, ensuring snappy traversal across bridge gaps and obstacles.
- Tactile CSS styling: active button press transforms (translateY 2px, scale 0.96) and darkened contrast for touch interaction on mobile Safari and desktop.

## [0.0.2] - 2026-10-27

### Fixed
- Stickman controls in Dunia Stickman (GameStage) are now always active during gameplay phase regardless of camera/fallback mode: on-screen buttons (`← Kiri`, `Kanan →`, `↑ Lompat`) render directly without requiring manual toggle to fallback mode.
- Keyboard listeners (ArrowLeft, ArrowRight, ArrowUp, KeyA, KeyD, KeyW, Space) now bind directly in gameplay phase; ArrowUp and KeyW now trigger jump alongside Space.
- Unified input merging: keyboard and on-screen pointer touches compose cleanly with camera driver; camera tracking loss no longer pauses or freezes manual button/keyboard inputs.
- Goal flag collision in KAPLAY runtime reports success on contact in gameplay phase without requiring grounded state at the moment of banner overlap.

### Added
- Unit tests in `tests/components/gamestage-controls.test.tsx` verifying default rendering of gameplay buttons, multi-pointer touch events (jump + run right), and keyboard navigation.
- Live browser test script exercising stickman horizontal movement, jump elevation, and goal flag completion on `https://dev.momominum.tech/levels`.

## [0.0.1] - 2026-10-27

### Fixed
- Dunia Stickman renders at actual viewport size × device pixel ratio; physics remains 800×380, camera uses uniform aspect-preserving scale. Removed forced nearest-neighbor/crisp-edge enlargement from gameplay canvas only.
- Pointer placement converts viewport coordinates through the same world scale/offset used by rendering; confirmation preserves XY.

### Added
- Gameplay-only Lompat button alongside Kiri/Kanan. Pointer IDs compose simultaneous actions; pointer release/cancel/lost capture and window blur clear held input.
- Gameplay viewport mapping unit tests and browser acceptance evidence for raster density, XY, keyboard/pointer movement, and responsive gameplay.

### Scope
- Tutorial/cards and other pages intentionally unchanged. Existing portrait entry obstruction in DrawingScreen is outside this patch; portrait gameplay acceptance enters on desktop then resizes.
- No production deployment, service restart, commit, or model/camera verification performed by this patch.
