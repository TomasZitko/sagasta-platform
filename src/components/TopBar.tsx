"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Nástroje" },
  { href: "/katalog-nebezpeci", label: "Katalog nebezpečí" },
];

export function TopBar() {
  const path = usePathname();
  return (
    <header className="topbar">
      <div className="container topbar__inner">
        <Link href="/" className="brand" aria-label="SAGASTA AI – přehled nástrojů">
          <span className="brand__mark" aria-hidden />
          SAGASTA <span className="brand__tag">AI</span>
        </Link>
        <nav className="topbar__nav" aria-label="Hlavní navigace">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
