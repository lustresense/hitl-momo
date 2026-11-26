import type { OwnerIconName } from "@/src/components/ui/owner-icons";
import { CANVAS_COPY } from "@/src/domain/copy/canvas";

/** Lima alat kanvas r8.3, dipakai bersama oleh CanvasScreen (P6) dan Tutorial Card 3 (P4). */
export type CanvasToolId = "pencil" | "eraser" | "undo" | "redo" | "clear";

/** Alat kuas yang aktif saat menyentuh kertas. */
export type ActiveBrushTool = "pencil" | "eraser";

export type CanvasToolKind = "mode" | "action";

export interface CanvasToolDefinition {
  readonly id: CanvasToolId;
  readonly icon: OwnerIconName;
  readonly kind: CanvasToolKind;
  readonly label: string;
  readonly ariaLabel: string;
  readonly title: string;
}

export const CANVAS_TOOL_IDS: readonly CanvasToolId[] = ["pencil", "eraser", "undo", "redo", "clear"];

export const CANVAS_TOOLS: readonly CanvasToolDefinition[] = [
  {
    id: "pencil",
    icon: "tool-pencil",
    kind: "mode",
    ...CANVAS_COPY.tools.pencil,
  },
  {
    id: "eraser",
    icon: "tool-eraser",
    kind: "mode",
    ...CANVAS_COPY.tools.eraser,
  },
  {
    id: "undo",
    icon: "tool-undo",
    kind: "action",
    ...CANVAS_COPY.tools.undo,
  },
  {
    id: "redo",
    icon: "tool-redo",
    kind: "action",
    ...CANVAS_COPY.tools.redo,
  },
  {
    id: "clear",
    icon: "tool-clear",
    kind: "action",
    ...CANVAS_COPY.tools.clear,
  },
];
