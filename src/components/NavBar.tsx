"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabaseClient";

const items = [
  { label: "Dashboard", href: "/dashboard-v2" },
  { label: "Pipeline", href: "/pipeline" },
  { label: "Comptes", href: "/accounts" },
  { label: "Deals", href: "/opportunities" },
  { label: "KPI", href: "/kpi" },
  { label: "Inside (Salim)", href: "/inside" },
];

export default function NavBar() {
  const path = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);

  async function onLogout() {
    try {
      setBusy(true);
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
        <div className="font-extrabold tracking-tight text-slate-900">
          <Link href={user ? "/dashboard-v2" : "/login"}>CRM-PIPE</Link>
        </div>

        {/* Menu visible seulement si connecté */}
        {!loading && user && (
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
        )}

        <div className="ml-auto flex items-center gap-3">
          {/* Si pas connecté */}
          {!loading && !user && (
            <>
              <div className="text-xs text-slate-500">Direction / Team</div>
              <Link
                href="/login"
                className="rounded-md border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Se connecter
              </Link>
            </>
          )}

          {/* Si connecté */}
          {!loading && user && (
            <>
              <div className="hidden sm:block text-xs text-slate-500">
                {user.email}
              </div>
              <button
                onClick={onLogout}
                disabled={busy}
                className="rounded-md border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {busy ? "Déconnexion…" : "Logout"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
