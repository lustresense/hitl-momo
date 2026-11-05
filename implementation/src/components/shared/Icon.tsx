import type { SVGProps } from "react";

/**
 * Small line-icon set (24px grid, 2px round stroke). Decorative by default:
 * every control that uses an icon also carries a text label or aria-label.
 */
const PATHS = {
  pencil: <><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z" /><path d="M14.5 6.5l3 3" /></>,
  eraser: <><path d="M20 20H9l-5-5a2 2 0 0 1 0-2.8L13 3.2a2 2 0 0 1 2.8 0l4.9 4.9a2 2 0 0 1 0 2.8L12 19.6" /><path d="M7 11l6 6" /></>,
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  redo: <><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></>,
  check: <path d="M4.5 12.5l5 5 10-11" />,
  swap: <><path d="M7 4L3 8l4 4" /><path d="M3 8h13" /><path d="M17 12l4 4-4 4" /><path d="M21 16H8" /></>,
  x: <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
  play: <path d="M8 5v14l11-7z" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.1-2.5 3.6" /><path d="M12 17.5v.01" /></>,
  back: <><path d="M15 5l-7 7 7 7" /></>,
  camera: <><path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" /></>,
  mouse: <path d="M5 3l14 7-6 2-2 6z" />,
  retry: <><path d="M4 12a8 8 0 1 0 2.6-5.9" /><path d="M4 4v4.5h4.5" /></>,
  move: <><path d="M12 3v18" /><path d="M3 12h18" /><path d="M9 6l3-3 3 3" /><path d="M9 18l3 3 3-3" /><path d="M6 9l-3 3 3 3" /><path d="M18 9l3 3-3 3" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  left: <path d="M14 5l-7 7 7 7" />,
  right: <path d="M10 5l7 7-7 7" />,
  up: <path d="M5 14l7-7 7 7" />,
  down: <><path d="M12 4v15" /><path d="M6 13l6 6 6-6" /></>,
  trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>,
  pen: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  brush: <><path d="M9.5 14.5L19 5a2 2 0 0 0-3-3L6.5 11.5" /><path d="M6.5 11.5c-2.5 0-4 1.5-4 4 0 2 1.5 3.5 3.5 3.5 2.5 0 4-2 4-4.5z" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4h12l-2 4 2 4H5" /></>,
  list: <><path d="M9 6h11" /><path d="M9 12h11" /><path d="M9 18h11" /><path d="M4 6h.01" /><path d="M4 12h.01" /><path d="M4 18h.01" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
