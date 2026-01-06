export type BU = 'CSG' | 'INFRA' | 'CYBER' | 'SERVICE'

export type DealRow = {
  id: string
  account_id: string
  title: string
  bu: BU | string | null
  pipeline_status?: string | null
  probability?: number | null
  amount?: number | null
  margin_pct?: number | null
  margin_percent?: number | null
  margin_amount?: number | null
  expected_booking_date?: string | null
  booking_date?: string | null
  invoiced_date?: string | null
  invoiced_amount?: number | null
  next_step?: string | null
  inside_status?: string | null
  updated_at?: string | null
}

export type AccountRow = { id: string; name: string }

export const STAGE_ORDER = [
  'Lead',
  'Discovery',
  'Qualified',
  'Solutioning',
  'Proposal Sent',
  'Negotiation',
  'Commit',
  'Won',
  'Lost / No decision',
] as const

export type Stage = (typeof STAGE_ORDER)[number]

export function canonicalStage(raw?: string | null): Stage {
  const s = (raw ?? '').trim().toUpperCase()
  if (!s) return 'Lead'
  if (s.includes('DISCOV')) return 'Discovery'
  if (s === 'LEAD') return 'Lead'
  if (s.includes('QUALIF')) return 'Qualified'
  if (s.includes('SOLUTION')) return 'Solutioning'
  if (s.includes('PROPOSAL')) return 'Proposal Sent'
  if (s.includes('NEGOT')) return 'Negotiation'
  if (s.includes('COMMIT')) return 'Commit'
  if (s === 'WON' || s.includes('CLOSED WON')) return 'Won'
  if (s.includes('LOST') || s.includes('NO DECISION')) return 'Lost / No decision'
  // fallback: garde un mapping “safe”
  return 'Lead'
}

export function toNumber(v: any, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function monthKey(dateStr?: string | null) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function buildDashboardData(deals: DealRow[], accounts: AccountRow[], year: number) {
  const accMap = new Map(accounts.map(a => [a.id, a.name]))

  const normalized = deals.map(d => {
    const amount = toNumber(d.amount, 0)
    const prob = Math.min(100, Math.max(0, toNumber(d.probability, 0)))
    const marginPct = d.margin_pct ?? d.margin_percent ?? null
    const stage = canonicalStage(d.pipeline_status ?? null)
    const account_name = accMap.get(d.account_id) ?? '—'
    return { ...d, amount, prob, marginPct, stage, account_name }
  })

  const openDeals = normalized.filter(d => d.stage !== 'Lost / No decision')
  const wonDeals = normalized.filter(d => d.stage === 'Won')
  const lostDeals = normalized.filter(d => d.stage === 'Lost / No decision')

  const pipelineTotal = openDeals.reduce((s, d) => s + d.amount, 0)
  const pipelineWeighted = openDeals.reduce((s, d) => s + d.amount * (d.prob / 100), 0)

  const avgMargin =
    openDeals.length === 0
      ? 0
      : openDeals
          .filter(d => d.marginPct !== null)
          .reduce((s, d) => s + toNumber(d.marginPct, 0), 0) /
        Math.max(1, openDeals.filter(d => d.marginPct !== null).length)

  // By BU
  const byBU = ['CSG', 'INFRA', 'CYBER', 'SERVICE'].map((bu) => {
    const list = openDeals.filter(d => (d.bu ?? '').toString().toUpperCase() === bu)
    const total = list.reduce((s, d) => s + d.amount, 0)
    const weighted = list.reduce((s, d) => s + d.amount * (d.prob / 100), 0)
    return { bu, total, weighted }
  })

  // By Stage (amount)
  const byStage = STAGE_ORDER.map(stage => {
    const list = openDeals.filter(d => d.stage === stage)
    const total = list.reduce((s, d) => s + d.amount, 0)
    return { stage, total }
  })

  // Donut (amount)
  const donut = [
    { name: 'Open', value: pipelineTotal },
    { name: 'Won', value: wonDeals.reduce((s, d) => s + d.amount, 0) },
    { name: 'Lost', value: lostDeals.reduce((s, d) => s + d.amount, 0) },
  ]

  // Forecast 12 mois (sur expected_booking_date)
  const months: string[] = []
  const start = new Date(year, 0, 1)
  for (let i = 0; i < 12; i++) {
    const d = new Date(start.getFullYear(), i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const forecast = months.map(mk => {
    const inMonth = openDeals.filter(d => monthKey(d.expected_booking_date) === mk)
    const total = inMonth.reduce((s, d) => s + d.amount, 0)
    const weighted = inMonth.reduce((s, d) => s + d.amount * (d.prob / 100), 0)
    const commit = inMonth.filter(d => d.stage === 'Commit').reduce((s, d) => s + d.amount, 0)
    const won = wonDeals.filter(d => monthKey(d.booking_date) === mk).reduce((s, d) => s + d.amount, 0)
    return { month: mk, total, weighted, commit, won }
  })

  // Inside status counts
  const insideStatuses = ['NEW','IN PROGRESS','WAITING VENDOR','PRICING RECEIVED','READY TO SEND','BOOKING PENDING','DONE','BLOCKED']
  const inside = insideStatuses.map(st => ({
    status: st,
    count: normalized.filter(d => (d.inside_status ?? 'NEW').toString().toUpperCase() === st).length,
  }))

  // Top deals
  const topDeals = [...openDeals]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)
    .map(d => ({
      id: d.id,
      client: (d as any).account_name,
      title: d.title,
      bu: (d.bu ?? '').toString(),
      stage: (d as any).stage,
      amount: d.amount,
      prob: d.prob,
      expected_booking_date: d.expected_booking_date ?? null,
      next_step: d.next_step ?? null,
      inside_status: d.inside_status ?? null,
    }))

  return {
    kpis: {
      pipelineTotal,
      pipelineWeighted,
      avgMargin,
      dealsCount: openDeals.length,
    },
    byBU,
    byStage,
    donut,
    forecast,
    inside,
    topDeals,
  }
}
