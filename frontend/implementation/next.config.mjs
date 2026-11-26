/** Frontend-only Next config: static export, no server functionality. */
const nextConfig = {
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
  // Satu tampilan: build dan dev biasa memakai UI r8.3 (nama panggilan, tanpa penggaris).
  // NEXT_PUBLIC_UI_R83=0 hanya untuk membandingkan dengan tampilan lama.
  env: { NEXT_PUBLIC_UI_R83: process.env.NEXT_PUBLIC_UI_R83 ?? "1" },
};

export default nextConfig;
