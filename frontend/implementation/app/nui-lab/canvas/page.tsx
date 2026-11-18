import type { Metadata } from "next";
import { NuiLabPage } from "@/src/components/nui-lab/NuiLabPage";

export const metadata: Metadata = {
  title: "Canvas Lab · NUI Lab",
  robots: { index: false, follow: false },
};

export default function NuiCanvasLabRoute() {
  return <NuiLabPage variant="canvas" />;
}
