import type { Metadata } from "next";
import { NuiLabPage } from "../../src/components/nui-lab/NuiLabPage";

export const metadata: Metadata = {
  title: "Uji Tangan NUI · Lab Owner",
  description: "Halaman uji pelacakan tangan sebelum pameran. Untuk Owner, tidak tertaut dari permainan siswa.",
  robots: { index: false, follow: false },
};

export default function NuiLabRoute() {
  return <NuiLabPage />;
}
