"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function MobileMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, []);
  return <>
    <button type="button" className="nav-toggle" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((o) => !o)}><span /><span /><span /></button>
    {open && <nav id="mobile-nav" className="nav-mobile" aria-label="Main" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}>{children}</nav>}
  </>;
}
