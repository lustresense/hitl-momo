import type { Metadata } from "next";
import { NuiLabPage } from "@/src/components/nui-lab/NuiLabPage";

export const metadata: Metadata = {
  title: "Gesture Detection Lab · NUI Lab",
  robots: { index: false, follow: false },
};

/** Static-export compatibility route: renders the unified Gesture Detection Lab directly. */
export default function NuiDiagnosticsRoute() {
  return <NuiLabPage variant="gesture" />;
}
