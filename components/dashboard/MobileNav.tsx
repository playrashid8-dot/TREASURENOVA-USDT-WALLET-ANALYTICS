"use client";

const LINKS = [
  { href: "#dashboard", label: "Dashboard" },
  { href: "#transactions", label: "Transactions" },
  { href: "#analytics", label: "Analytics" },
  { href: "#system", label: "System" },
];

export function MobileNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--tn-border)] bg-white/95 backdrop-blur md:hidden"
      aria-label="Mobile navigation"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4 gap-1 px-2 py-2">
        {LINKS.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              className="flex min-h-12 items-center justify-center rounded-xl px-1 text-center text-[11px] font-semibold text-[var(--tn-navy)] hover:bg-slate-50"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
