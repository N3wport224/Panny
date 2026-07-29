"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Newspaper, ScanBarcode } from "lucide-react";

const TABS = [
  { href: "/", label: "Penny Feed", Icon: Newspaper },
  { href: "/scanner", label: "Scan Item", Icon: ScanBarcode },
] as const;

/**
 * Fixed bottom tab bar, iOS-style. pb-safe keeps the tap targets above the
 * iPhone home indicator when running as a standalone PWA.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-950/95 backdrop-blur pb-safe">
      <div className="mx-auto flex h-16 max-w-lg">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors ${
                active ? "text-green-500" : "text-slate-500"
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 2} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
