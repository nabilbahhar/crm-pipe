'use client'

import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Download } from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  LineChart, Line,
  PieChart, Pie, Cell,
} from 'recharts'

type DashboardData = {
  year: number
  kpis: {
    dealsCount: number
    pipelineTotal: number
    pipelineWeighted: number
    avgMargin: number
    wonAmount: number
    mixCsgPct: number
  }
  byBu: { bu: string; total: number; weighted: number; avgMargin: number }[]
  byStage: { stage: string; total: number; count: number }[]
  byMonth: { month: string; total: number; weighted: number; commit: number; won: number }[]
  openWonLost: { name: 'Open' | 'Won' | 'Lost'; amount: number }[]
  topDeals: {
    id: string
    accountName: string
    title: string
    bu: string
    stage: string
    amount: number
    prob: number
    booking: string | null
    insideStatus: string
    nextStep: string
  }[]
}

const COLORS = ['#2563eb', '#16a34a', '#ef4444', '#a855f7', '#f59e0b', '#06b6d4']

const mad = (n: number) =>
  new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD', maximumFractionDigits: 0 }).format(n || 0)

const pct = (n: number) =>
  `${(n || 0).toFixed(1)}%`

function Card(props: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{props.title}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{props.value}</div>
      {props.sub ? <div className="mt-1 text-sm text-slate-500">{props.sub}</div> : null}
    </div>
  )
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 text-sm font-semibold text-slate-900">{props.title}</div>
      <div className="h-[320px]">{props.children}</div>
    </div>
  )
}

export default function DashboardV2() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState<number>(currentYear)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      const r = await fetch(`/api/analytics/dashboard?year=${year}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'Erreur API')
      setData(j)
    } catch (e: any) {
      setErr(e?.message || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [year]) // eslint-disable-line react-hooks/exhaustive-deps

  const yearOptions = useMemo(() => {
    // affiche 2025-2027 par défaut
    return [currentYear - 1, currentYear, currentYear + 1]
  }, [currentYear])

  const downloadCsv = (kind: 'comit-month' | 'late-m1' | 'comit-quarter' | 'pack24') => {
    // On branchera un export “propre” après. Là on garde juste l’action visible.
    // Si tu as déjà des routes d’export existantes, tu les mets ici.
    const url = `/api/exports?type=${kind}&year=${year}`
    window.open(url, '_blank')
  }

  const k = data?.kpis

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-2xl font-bold text-slate-900">Dashboard (Direction)</div>
            <div className="text-sm text-slate-500">Vue synthèse + pilotage</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-10 rounded-xl border bg-white px-3 text-sm"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <button
              className="inline-flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-sm hover:bg-slate-100"
              onClick={load}
              disabled={loading}
              title="Rafraîchir"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Rafraîchir
            </button>

            <div className="h-10 w-px bg-slate-200" />

            <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-sm text-white hover:bg-slate-800"
              onClick={() => downloadCsv('comit-month')}
              title="COMIT Mensuel (mois en cours)"
            >
              <Download className="h-4 w-4" /> COMIT Mensuel
            </button>

            <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-sm text-white hover:bg-slate-800"
              onClick={() => downloadCsv('late-m1')}
              title="Retard Booking (M-1)"
            >
              <Download className="h-4 w-4" /> Retard Booking (M-1)
            </button>

            <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-sm text-white hover:bg-slate-800"
              onClick={() => downloadCsv('comit-quarter')}
              title="COMIT Trimestriel"
            >
              <Download className="h-4 w-4" /> COMIT Trimestriel
            </button>

            <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-sm text-white hover:bg-slate-800"
              onClick={() => downloadCsv('pack24')}
              title="Pack Revue du 24"
            >
              <Download className="h-4 w-4" /> Pack Revue du 24
            </button>
          </div>
        </div>

        {err ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card title="Pipeline total" value={mad(k?.pipelineTotal || 0)} sub={`Deals: ${k?.dealsCount || 0}`} />
          <Card title="Pipeline pondéré" value={mad(k?.pipelineWeighted || 0)} sub={`Marge moy.: ${pct(k?.avgMargin || 0)}`} />
          <Card title="Won (année)" value={mad(k?.wonAmount || 0)} sub={`Mix CSG: ${pct(k?.mixCsgPct || 0)}`} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Section title="Pipeline par BU (Total vs Pondéré)">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.byBu || []} margin={{ left: 10, right: 10 }}>
                <XAxis dataKey="bu" />
                <YAxis tickFormatter={(v) => `${Math.round(v/1000)}k`} />
                <Tooltip formatter={(v: any) => mad(Number(v))} />
                <Legend />
                <Bar dataKey="total" name="Total" fill={COLORS[0]} radius={[8,8,0,0]} />
                <Bar dataKey="weighted" name="Pondéré" fill={COLORS[5]} radius={[8,8,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Section>

          <Section title="Pipeline par stage (Total)">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.byStage || []} layout="vertical" margin={{ left: 40, right: 10 }}>
                <XAxis type="number" tickFormatter={(v) => `${Math.round(v/1000)}k`} />
                <YAxis type="category" dataKey="stage" width={130} />
                <Tooltip formatter={(v: any) => mad(Number(v))} />
                <Bar dataKey="total" name="Total" fill={COLORS[1]} radius={[0,8,8,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Section>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Section title="Forecast par mois (Total / Pondéré / Commit / Won)">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.byMonth || []} margin={{ left: 10, right: 10 }}>
                <XAxis dataKey="month" tickFormatter={(m) => m.slice(5)} />
                <YAxis tickFormatter={(v) => `${Math.round(v/1000)}k`} />
                <Tooltip formatter={(v: any) => mad(Number(v))} />
                <Legend />
                <Line type="monotone" dataKey="total" name="Total" stroke={COLORS[0]} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="weighted" name="Pondéré" stroke={COLORS[5]} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="commit" name="Commit" stroke={COLORS[4]} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="won" name="Won" stroke={COLORS[1]} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Section>

          <Section title="Open / Won / Lost (montant)">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip formatter={(v: any) => mad(Number(v))} />
                <Legend />
                <Pie
                  data={data?.openWonLost || []}
                  dataKey="amount"
                  nameKey="name"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={3}
                >
                  {(data?.openWonLost || []).map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </Section>
        </div>

        <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900">Top 10 deals (pilotage)</div>
            <div className="text-xs text-slate-500">
              Astuce : si tes montants sont à 0, c’est juste tes deals test (on les corrigera après).
            </div>
          </div>

          <div className="overflow-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-left text-slate-500">
                <tr className="border-b">
                  <th className="py-2">Client</th>
                  <th className="py-2">Deal</th>
                  <th className="py-2">BU</th>
                  <th className="py-2">Stage</th>
                  <th className="py-2">Montant</th>
                  <th className="py-2">Prob</th>
                  <th className="py-2">Booking prévu</th>
                  <th className="py-2">Inside</th>
                  <th className="py-2">Next step</th>
                </tr>
              </thead>
              <tbody>
                {(data?.topDeals || []).map((d) => (
                  <tr key={d.id} className="border-b last:border-b-0">
                    <td className="py-2">{d.accountName}</td>
                    <td className="py-2">{d.title}</td>
                    <td className="py-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{d.bu}</span>
                    </td>
                    <td className="py-2">{d.stage}</td>
                    <td className="py-2 font-medium text-slate-900">{mad(d.amount)}</td>
                    <td className="py-2">{d.prob}%</td>
                    <td className="py-2">{d.booking || '—'}</td>
                    <td className="py-2">{d.insideStatus}</td>
                    <td className="py-2">{d.nextStep}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
