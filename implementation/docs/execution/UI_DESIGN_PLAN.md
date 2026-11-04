# UI design plan (wp-ui)

Scope: visual language, copy and structure of the student-facing screens. Product decisions are unchanged (flow, Top-3 semantics, Redraw as recovery path, SYSTEM vs Momo voices, mock prediction labelled as demo).

## 1. First draft (before critique)

Concept: "squared school notebook". Graph-paper ground, blue ballpoint for actions, a yellow highlighter for what the student chose, margin-red for problems, pencil grey for everything the machine says.
Type: Lexend (UI, headings) plus Patrick Hand for Momo's handwriting.
Layout: one primary object per screen, large targets, text only where an icon cannot say it.

Palette v1: paper `#f3f6f8`, ink `#111111`, ballpoint `#1b4bd1`, highlighter `#ffe14a`, margin red `#c81e32`, pencil `#4b5058`.

## 2. Critique against the "generic default"

| Check | Finding in v1 | Revision |
|---|---|---|
| Cream + serif + terracotta? | No: cool graph paper, blue, sans. | Kept. The old orange/cream/black-outline/dashed-border look is removed everywhere in our CSS. |
| Near-black + one acid accent? | Highlighter yellow could read as "acid on dark". | Yellow is only ever a background behind dark text (marker swipe), never a button or a glow. Buttons are blue or outlined. |
| SaaS card kit (same radius, same soft shadow)? | Planned "cards" for everything. | Radius by role: paper slips 4px, controls 12px, chips pill, ribbons notched. No soft grey shadows and no gradients. Depth comes from a 1px paper edge, not blur. |
| Chrome tells (ALL-CAPS tracked eyebrows, "A · B · C", "WORD — fragment", arrows on buttons, mono labels, numbered markers) | The old UI is full of them. | Removed. Labels are sentence case, one plain verb, icon plus 1-3 words. Icons are inline SVG, never "→" glyphs or emoji. Numbers only where the content is a sequence (tutorial steps, Top-3 rank). |
| Motion on everything? | Old UI had hover lifts on every card and a fade on each section. | Motion only answers an action: panel arrives after "Tebak", confidence bars fill once, a pressed button sinks 1px, ribbon pull (existing mechanic). Everything is off under `prefers-reduced-motion`. |
| Boldness spread thin? | Easy to over-decorate. | One memorable idea (below). Everything else is flat and quiet. |

## 3. The one memorable place: pencil says, ink decides

The AI's output is always drawn in pencil: grey, hatched, tentative (confidence bars are pencil shading, Momo writes in a handwriting face). The student's decision is always drawn in pen and marker: ballpoint-blue outline, a yellow highlighter swipe behind the chosen label. A student never has to read an explanation of "AI suggests, you decide"; the materials say it. The Top-3 answer slips are the showpiece: three big paper slips, pencil bars on all three, the chosen one highlighted and inked.

Three voices, three treatments (consistent across the app):
- SISTEM (mission briefing): upright print face, notebook page with a red margin line.
- Momo: handwriting face, pencil-grey outline bubble, text only, never decides.
- Student: ballpoint blue and highlighter.

## 4. Final tokens

| Role | Name | Hex | Contrast notes |
|---|---|---|---|
| Ground | Kertas kotak | `#f3f6f8` (grid `#d3e2ee`) | ink on ground 17.4:1 |
| Text | Tinta | `#111111` | |
| Machine | Pensil | `#4b5058` (bar hatch `#6d737b`) | 7.5:1 on ground |
| Action / student | Pulpen biru | `#1b4bd1` (hover `#12349a`) | white on blue 7.1:1 |
| Chosen | Stabilo | `#ffe14a` | ink on it 14.5:1; blue on it 5.4:1 |
| Problem | Tip-Ex merah | `#c81e32` | white on red 5.7:1 |
| Success (state only) | Hijau spidol | `#14774f` | white on green 5.6:1 |

Type: Lexend variable (weights 400-800, bundled latin subset, OFL) for UI; Patrick Hand 400 (bundled, OFL) for Momo and short handwritten notes. Both in `public/fonts/` with licences, loaded by `@font-face`, no network at runtime. Scale 14 / 16 / 18 / 24 / 32 / 48.
Shape: slips 4px, controls 12px, chips 999px. Strokes 1.5px pencil for hairlines, 2px ink for controls that must be found fast. Focus: 3px ink ring with a 2px paper gap, visible on every ground.
Touch: every control at least 44px, primary actions 56px.

## 5. Copy rules

Bahasa Indonesia, sentence case, plain verbs, active voice. Visual state (bars, highlight, disabled, progress) before sentences. Errors say what happened and what to do. No paragraph on gameplay overlays. Gesture hints (Genggam / 2 Jari / 3 Jari) are removed: only pinch-to-draw exists.
Provenance: a small fixed chip "Demo / simulasi" on every screen after the camera cover, and the same words on the Top-3 panel. Never presented as a real model.

## 6. Screen decisions

| Screen | Change |
|---|---|
| Student number | Title "Nomor absenmu", caption "Geser penggaris", one big number, button "Lanjut". |
| Tutorial | 3 steps, one line each, interactive demos kept. Gesture toolbar becomes five icon buttons. |
| Level cards | Ribbons kept (pull or click). Unlocked blue, locked graphite with lock. "Pilih level" + "Tarik pita ke bawah". |
| Mission briefing | SISTEM label, short title, one line, example chips, "Mulai" / "Lewati". |
| Drawing | Full-bleed graph paper. Icon rail (Pensil, Hapus, Mundur, Maju). Segmented Mouse/Kamera. One primary "Tebak gambarku". Momo bubble: one short sentence. |
| Top-3 | Right-hand panel (drawing stays visible). Three slips with rank, label, pencil bar, percent. Actions: Terima / Pilih lain / Bukan ketiganya (icons). "Wujudkan objek" primary. "Gambar ulang" is a quiet recovery link, not a fourth decision. |
| Predicting / error | Pencil-stroke loader; error says what happened and offers "Coba lagi" / "Gambar ulang". |
| Placement | One line "Seret objek ke posisi" and "Taruh di sini". |
| Gameplay | Header chip with the student's decision, big on-screen Kiri / Kanan / Lompat, small object tray. |
| Outcome | Compact note: icon, one word, up to three icon buttons. |
| Summary | Level title, what the student decided (label plus how), one literacy sentence from level data, two buttons. |

## 7. Not in this package

Camera cover and global camera widget (other worker), StageArtwork / StageAtmosphere / Momo avatar / Character A artwork, game runtime. The cover screen only inherits the new palette through variable overrides in `globals.css`.

## 8. Results

Filled in at the end of the work package: see the final section "Measured copy reduction" below.
