"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const items = [
  { label: "Dashboard", href: "/dashboard-v3" },
  { label: "Pipeline", href: "/pipeline" },
  { label: "Comptes", href: "/accounts" },
  { label: "Deals", href: "/opportunities" },
  { label: "KPI", href: "/kpi" },
  { label: "Inside", href: "/inside" },
];

export default function NavBar() {
  const path = usePathname();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setEmail(data?.user?.email ?? null);
    };

    load();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

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

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden sm:block text-xs text-slate-500">
            {email ? `Connecté : ${email}` : "Non connecté"}
          </div>

          <button
            onClick={logout}
            className="h-9 rounded-xl bg-slate-900 px-3 text-sm text-white hover:bg-slate-800"
            title="Se déconnecter"
          >
            Déconnexion
          </button>
        </div>
      </div>
    </div>
  );
}