import type { Metadata } from "next";
import { NuiLabPage } from "@/src/components/nui-lab/NuiLabPage";

export const metadata: Metadata = {
  title: "Diagnostik MediaPipe · NUI Lab",
  robots: { index: false, follow: false },
};

export default function NuiDiagnosticsRoute() {
  return <NuiLabPage variant="diagnostics" />;
}
