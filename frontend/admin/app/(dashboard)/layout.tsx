"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRequireUser, useAuth } from "@/lib/auth";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = useRequireUser();
  const { logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  if (!user) return <div className="empty">Memuat…</div>;

  const nav =
    user.role === "admin"
      ? [
          { href: "/sekolah", label: "Sekolah" },
          { href: "/kelas", label: "Semua Kelas" },
          { href: "/kesulitan", label: "Level Kesulitan" },
          { href: "/tombol-lewati", label: "Tombol Lewati" },
        ]
      : [{ href: "/kelas", label: "Kelas Saya" }];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            Sketchbook Universe
            <small>{user.role === "admin" ? "Admin" : "Guru"}</small>
          </div>
        </div>
        <nav className="nav">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={pathname.startsWith(n.href) ? "active" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div>
            <div className="who">{user.name}</div>
            <div className="role">{user.school ? user.school.name : user.email}</div>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
          >
            Keluar
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
