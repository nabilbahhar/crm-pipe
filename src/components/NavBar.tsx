"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Pipeline", href: "/pipeline" },
  { label: "Comptes", href: "/accounts" },
  { label: "Deals", href: "/opportunities" },
  { label: "KPI", href: "/kpi" },
  { label: "Inside (Salim)", href: "/inside" },
];

export default function NavBar() {
  const path = usePathname();

  return (
    <div className="border-b bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
        <div className="font-extrabold tracking-tight text-slate-900">
          CRM-PIPE
        </div>

        <nav className="flex flex-wrap gap-4 text-sm">
          {items.map((it) => {
            const active = path === it.href || path.startsWith(it.href + "/");
            return (
              <Link
                key={it.href}
                href={it.href}
                className={
                  active
                    ? "font-semibold text-slate-900"
                    : "text-slate-600 hover:text-slate-900"
                }
              >
                {it.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto text-xs text-slate-500">Direction / Team</div>
      </div>
    </div>
  );
}
