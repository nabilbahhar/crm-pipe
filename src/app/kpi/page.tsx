"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";

type KPIResp =
  | {
      year: number;
      total: number;
      byBU: Record<string, number>;
      byMonth: Record<string, number>;
      topClients: { client: string; amount: number }[];
    }
  | { error: string };

function fmtMAD(n: number) {
  return (
    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) +
    " MAD"
  );
}

export default function KPIPage() {
  const [year, setYear] = useState<number>(2026);
  const [data, setData] = useState<KPIResp | null>(null);
  const [loading, setLoading] = useState(false);

  // règles business (on ajuste après)
  const target = 30_000_000; // objectif annuel facturé
  const guarantee = 300_000; // commission minimale annuelle
  const mixBonusRate = 0.005; // +0,5% si mix 50/50

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // On utilise l’endpoint que tu viens de valider (il marche)
      const r = await fetch(`/api/analytics/summary?year=${year}`, {
        cache: "no-store",
      });
      const j = (await r.json()) as KPIResp;
      setData(j);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  const okData = data && !("error" in data) ? data : null;
  const apiError = data && "error" in data ? data.error : null;

  const computed = useMemo(() => {
    const total = okData?.total ?? 0;
    const remaining = Math.max(target - total, 0);
    const pct = target > 0 ? (total / target) * 100 : 0;

    const csg = okData?.byBU?.CSG ?? 0;
    const others = total - csg;
    const mixCsgPct = total > 0 ? (csg / total) * 100 : 0;

    // tolérance 45–55%
    const mixOK = mixCsgPct >= 45 && mixCsgPct <= 55;

    const mixBonus = mixOK ? total * mixBonusRate : 0;
    const commissionEstimate = guarantee + mixBonus;

    return {
      total,
      remaining,
      pct,
      csg,
      others,
      mixCsgPct,
      mixOK,
      mixBonus,
      commissionEstimate,
    };
  }, [okData]);

  const buPie = useMemo(() => {
    const byBU = okData?.byBU ?? {};
    return Object.entries(byBU).map(([name, value]) => ({
      name,
      value: Number(value),
    }));
  }, [okData]);

  const monthLine = useMemo(() => {
    const byMonth = okData?.byMonth ?? {};
    const keys = Object.keys(byMonth).sort();
    let cum = 0;
    return keys.map((k) => {
      const m = Number(byMonth[k] ?? 0);
      cum += m;
      return { month: k, monthly: m, cumulative: cum };
    });
  }, [okData]);

  const topClients = okData?.topClients ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-bold text-slate-900">
            Objectifs & KPI Perso
          </div>
          <div className="text-sm text-slate-600">
            Basé sur le <b>facturé</b> (pas PO). Objectif annuel :{" "}
            <b>{fmtMAD(target)}</b> avant le 31/12/{year}.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            className="rounded-xl border bg-white px-3 py-2 text-sm"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
            <option value={2024}>2024</option>
          </select>

          <button
            className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-slate-50"
            onClick={load}
            disabled={loading}
          >
            {loading ? "..." : "Rafraîchir"}
          </button>
        </div>
      </div>

      {apiError ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {apiError}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <Card
          title="Facturé YTD"
          value={fmtMAD(computed.total)}
          sub={loading ? "Chargement..." : "Somme des factures"}
        />
        <Card
          title="Reste à facturer"
          value={fmtMAD(computed.remaining)}
          sub={`Objectif: ${fmtMAD(target)}`}
        />
        <Card
          title="% objectif atteint"
          value={`${computed.pct.toFixed(1)}%`}
          sub={computed.pct >= 100 ? "Surperformance" : "Performance"}
        />
        <Card
          title="Mix CSG"
          value={`${computed.mixCsgPct.toFixed(1)}%`}
          sub={computed.mixOK ? "OK (bonus 0,5%)" : "Hors 50/50"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border bg-white p-4 lg:col-span-1">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-slate-900">
              Répartition facturé par BU
            </div>
            <div className="text-xs text-slate-500">{year}</div>
          </div>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={buPie} dataKey="value" nameKey="name" outerRadius={90} label />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-slate-900">
              Facturé par mois + cumul
            </div>
            <div className="text-xs text-slate-500">Mensuel & Cumul</div>
          </div>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthLine}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(v: any) => fmtMAD(Number(v))} />
                <Legend />
                <Line type="monotone" dataKey="monthly" name="Mensuel" strokeWidth={2} />
                <Line type="monotone" dataKey="cumulative" name="Cumul" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border bg-white p-4 lg:col-span-2">
          <div className="font-semibold text-slate-900">Top 10 clients (facturé)</div>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topClients}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="client" />
                <YAxis />
                <Tooltip formatter={(v: any) => fmtMAD(Number(v))} />
                <Bar dataKey="amount" name="Facturé" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 lg:col-span-1">
          <div className="font-semibold text-slate-900">Commissions (estimation)</div>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <Row label="Garantie annuelle" value={fmtMAD(guarantee)} />
            <Row label="Bonus mix 50/50 (+0,5%)" value={fmtMAD(computed.mixBonus)} />
            <div className="my-2 border-t" />
            <Row
              label="Estimation (hors surperformance)"
              value={fmtMAD(computed.commissionEstimate)}
              strong
            />
          </div>
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            Surperformance (&gt; 30M) : on ajoute la règle dès que c’est défini.
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="text-xs font-semibold text-slate-500">{title}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-600">{sub}</div> : null}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-slate-600">{label}</div>
      <div className={strong ? "font-bold text-slate-900" : "font-medium text-slate-900"}>
        {value}
      </div>
    </div>
  );
}
