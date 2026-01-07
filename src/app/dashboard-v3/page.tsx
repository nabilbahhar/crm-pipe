'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type SummaryResponse = {
  year: number
  total: number
  byBU: Record<string, number>
  byMonth: Record<string, number>
  topClients: { client: string; amount: number }[]
}

function mad(n: number) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' MAD'
}

export default function DashboardV3Page() {
  const [year, setYear] = useState<number>(2026)
  const [loading, setLoading] = useState<boolean>(true)
  const [err, setErr] = useState<string | null>(null)
  const [summary, setSummary] = useState<SummaryResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setErr(null)
      try {
        const r = await fetch(`/api/analytics/summary?year=${year}`, { cache: 'no-store' })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data = (await r.json()) as SummaryResponse
        if (!cancelled) setSummary(data)
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? 'Erreur inconnue')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [year])

  const buData = useMemo(() => {
    const byBU = summary?.byBU ?? {}
    return Object.entries(byBU)
      .map(([bu, amount]) => ({ bu, amount }))
      .sort((a, b) => b.amount - a.amount)
  }, [summary])

  const monthData = useMemo(() => {
    const byMonth = summary?.byMonth ?? {}
    return Object.entries(byMonth)
      .map(([k, amount]) => ({ month: k, amount }))
      .sort((a, b) => a.month.localeCompare(b.month))
  }, [summary])

  const topClients = useMemo(() => {
    return (summary?.topClients ?? []).slice(0, 10)
  }, [summary])

  const total = summary?.total ?? 0
  const bestBU = buData[0]?.bu ?? '—'
  const bestBUAmount = buData[0]?.amount ?? 0

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Dashboard (Direction) — V3</h1>
            <p className="text-sm text-slate-600">Vue synthèse + pilotage</p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-700">Année</label>
            <select
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
            </select>

            <button
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
              onClick={() => {
                // force reload
                setYear((y) => y)
              }}
            >
              Rafraîchir
            </button>
          </div>
        </div>

        {err && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Erreur: {err}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Total (année)" value={mad(total)} loading={loading} />
          <KpiCard title="BU #1" value={bestBU} loading={loading} />
          <KpiCard title="CA BU #1" value={mad(bestBUAmount)} loading={loading} />
          <KpiCard title="Top clients" value={`${topClients.length}`} loading={loading} />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Répartition par BU (bar)">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={buData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bu" />
                  <YAxis />
                  <Tooltip formatter={(v: any) => mad(Number(v))} />
                  <Legend />
                  <Bar dataKey="amount" name="Montant" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Répartition par BU (donut)">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip formatter={(v: any) => mad(Number(v))} />
                  <Legend />
                  <Pie data={buData} dataKey="amount" nameKey="bu" innerRadius={55} outerRadius={90} paddingAngle={2} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Évolution mensuelle (line)">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(v: any) => mad(Number(v))} />
                  <Legend />
                  <Line type="monotone" dataKey="amount" name="Montant" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Top clients (table)">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left">Client</th>
                    <th className="px-3 py-2 text-right">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {topClients.map((c) => (
                    <tr key={c.client} className="border-t border-slate-200">
                      <td className="px-3 py-2">{c.client}</td>
                      <td className="px-3 py-2 text-right font-medium">{mad(c.amount)}</td>
                    </tr>
                  ))}
                  {topClients.length === 0 && (
                    <tr>
                      <td className="px-3 py-6 text-center text-slate-500" colSpan={2}>
                        Aucun client
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}

function KpiCard(props: { title: string; value: string; loading: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-600">{props.title}</div>
      <div className="mt-2 text-xl font-semibold text-slate-900">{props.loading ? '…' : props.value}</div>
    </div>
  )
}

function Panel(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 text-sm font-semibold text-slate-900">{props.title}</div>
      {props.children}
    </div>
  )
}
