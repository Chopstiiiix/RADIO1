"use client";

import { usePathname } from "next/navigation";

export default function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <>
      <a href={href} className={isActive ? "nav-link-active" : ""} style={{
        fontSize: "13px",
        color: isActive ? "#ffffff" : "var(--text-secondary)",
        textDecoration: "none",
        padding: "4px 8px",
        borderRadius: "4px",
        transition: "color 0.15s",
        whiteSpace: "nowrap",
        fontWeight: isActive ? 700 : 400,
      }}>
        {children}
      </a>
      <style>{`
        @keyframes nav-glow-pulse {
          0%, 100% { text-shadow: 0 0 6px rgba(255,255,255,0.4); }
          50% { text-shadow: 0 0 12px rgba(255,255,255,0.7), 0 0 20px rgba(245,158,11,0.3); }
        }
        .nav-link-active {
          animation: nav-glow-pulse 2s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}
