import type { Metadata } from "next";
import { R18PilotPage } from "@/src/components/nui-lab/R18PilotPage";

export const metadata: Metadata = {
  title: "R18 UX3 Pilot · NUI Lab · Sketchbook Universe",
  description: "Pilot webcam MediaPipe + trained R18 UX3 classifier. Lab-only, no game actions.",
  robots: { index: false, follow: false },
};

export default function R18PilotRoute() {
  return <R18PilotPage />;
}
