"use client";

// Re-exported from page.tsx composition — Player logic lives in useStream hook
// This component exists as a wrapper if needed for future expansion
export default function Player({ children }: { children: React.ReactNode }) {
  return <div className="w-full">{children}</div>;
}
