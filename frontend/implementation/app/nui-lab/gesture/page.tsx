import type { Metadata } from "next";
import { NuiLabPage } from "@/src/components/nui-lab/NuiLabPage";

export const metadata: Metadata = {
  title: "Gesture Detection · NUI Lab",
  robots: { index: false, follow: false },
};

export default function NuiGestureLabRoute() {
  return <NuiLabPage variant="gesture" />;
}
