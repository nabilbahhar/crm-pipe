import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { requireAuth } from '@/lib/apiAuth'
import { analyticsLimiter } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

type Mode = 'year' | 'quarter' | 'month'

type SummaryKpis = {
  dealsCount: number
  openCount?: number
  wonCount?: number
  lostCount?: number
  pipelineTotal: number
  pipelineWeighted: number
  weightedPct?: number
  commitAmount?: number
  commitCount?: number
  wonAmount: number
  wonAvgMargin?: number
  mixCsgPct: number
  mixCirsPct?: number
}

type SummaryTopClient = {
  client: string
  total: number
  weighted?: number
  csg?: number
  cirs?: number
  deals?: number
}

type SummaryTopVendor = {
  vendor: string
  total: number
  deals?: number
}

type SummaryByBu = { bu: string; total: number; weighted: number; deals?: number }
type SummaryByStage = { stage: string; total: number; count: number }

type SummaryDeal = {
  id: string
  accountName: string
  title: string
  bu: string
  vendor?: string
  stage: string
  status: 'Open' | 'Won' | 'Lost'
  amount: number
  prob: number
  weighted: number
  bookingMonth?: string | null
  nextStep?: string
}

type SummaryResponse = {
  year: number
  mode: Mode
  month: number | null
  q: number | null
  periodLabel?: string
  kpis: SummaryKpis
  dataQuality?: {
    missingAmount?: number
    missingCloseMonth?: number
    missingNextStep?: number
    blockedInside?: number
  }
  byBu?: SummaryByBu[]
  byStage?: SummaryByStage[]
  topClients?: SummaryTopClient[]
  topVendors?: SummaryTopVendor[]
  openWonLost?: { name: 'Open' | 'Won' | 'Lost'; amount: number }[]
  lateM1?: {
    month: string
    count: number
    amount: number
    deals: SummaryDeal[]
  } | null
  lists?: {
    topOpenDeals?: SummaryDeal[]
    topWonDeals?: SummaryDeal[]
  }
}

type DbOpp = {
  id: string
  account_id: string
  title: string | null
  stage: string | null
  status: 'Open' | 'Won' | 'Lost' | null
  bu: string | null
  vendor: string | null
  amount: number | null
  prob: number | null
  booking_month: string | null
  next_step: string | null
  multi_bu: boolean | null
  bu_lines: any
  deal_type: string | null
  accounts?: { name?: string | null } | null
}

type Line = { bu: string; vendor: string; amount: number }

const pad2 = (n: number) => String(n).padStart(2, '0')

function monthKey(year: number, month: number) {
  return `${year}-${pad2(month)}`
}

function addMonths(year: number, month: number, delta: number) {
  const d = new Date(year, month - 1, 1)
  d.setMonth(d.getMonth() + delta)
  return { y: d.getFullYear(), m: d.getMonth() + 1 }
}

function periodRangeKeys(year: number, mode: Mode, month: number | null, q: number | null) {
  if (mode === 'year') {
    const start = `${year}-01`
    const end = `${year + 1}-01`
    return { start, end, label: `Année ${year}` }
  }
  if (mode === 'month') {
    const m = month ?? 1
    const start = monthKey(year, m)
    const nx = addMonths(year, m, 1)
    const end = monthKey(nx.y, nx.m)
    return { start, end, label: `Mensuel ${year}-${pad2(m)}` }
  }
  // quarter
  const qq = q ?? 1
  const startMonth = (qq - 1) * 3 + 1
  const start = monthKey(year, startMonth)
  const nx = addMonths(year, startMonth, 3)
  const end = monthKey(nx.y, nx.m)
  return { start, end, label: `Trimestre Q${qq} ${year}` }
}

function normText(x: any) {
  return String(x ?? '').trim()
}

function normBu(x: any) {
  const v = normText(x)
  if (!v) return '—'
  return v
}

function normVendor(x: any) {
  const v = normText(x)
  if (!v) return '—'
  return v
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

function isMulti(o: DbOpp) {
  const dt = normText(o.deal_type).toLowerCase()
  const bu = normText(o.bu).toUpperCase()
  return o.multi_bu === true || dt === 'multi' || bu === 'MULTI'
}

function safeLines(o: DbOpp): Line[] {
  const raw = o.bu_lines
  const arr = Array.isArray(raw) ? raw : []
  const lines = arr
    .map((x: any) => ({
      bu: normBu(x?.bu),
      vendor: normVendor(x?.card ?? x?.vendor),
      amount: Number(x?.amount ?? 0) || 0,
    }))
    .filter((l: Line) => l.bu !== '—' && l.vendor !== '—' && l.amount >= 0)

  return lines
}

function dealTotalAmount(o: DbOpp) {
  const a = Number(o.amount ?? 0) || 0
  if (a > 0) return a
  if (isMulti(o)) {
    const sum = safeLines(o).reduce((s, l) => s + (Number(l.amount) || 0), 0)
    return sum
  }
  return a
}

function explode(o: DbOpp): Line[] {
  if (isMulti(o)) {
    const lines = safeLines(o)
    if (lines.length) return lines
    return [{ bu: 'MULTI', vendor: 'MULTI', amount: dealTotalAmount(o) }]
  }
  return [{ bu: normBu(o.bu), vendor: normVendor(o.vendor), amount: dealTotalAmount(o) }]
}

function weighted(amount: number, prob: number) {
  return (Number(amount) || 0) * ((Number(prob) || 0) / 100)
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    // ─── Rate limiting: 30 req/min per user ───
    const rl = analyticsLimiter.check(auth.user.email || auth.user.id)
    if (!rl.ok) return NextResponse.json({ error: rl.error }, { status: 429 })

    const sp = req.nextUrl.searchParams
    const year = Math.max(2020, Math.min(2100, Number(sp.get('year') || new Date().getFullYear())))
    const mode = (sp.get('mode') as Mode) || 'quarter'
    const month = sp.get('month') ? Math.max(1, Math.min(12, Number(sp.get('month')))) : null
    const q = sp.get('q') ? Math.max(1, Math.min(4, Number(sp.get('q')))) : null

    const { start, end, label } = periodRangeKeys(year, mode, month, q)

    // On charge les opportunités (on agrège en JS => robuste aux changements)
    const r = await supabaseServer
      .from('opportunities')
      .select(
        'id,account_id,title,stage,status,bu,vendor,amount,prob,booking_month,next_step,multi_bu,bu_lines,deal_type,accounts(name)'
      )
      .order('created_at', { ascending: false })

    if (r.error) throw new Error(r.error.message)

    const all = (r.data || []) as DbOpp[]

    // Période: on inclut Open dont booking_month est dans [start,end) OU booking_month null (data quality)
    const inPeriod = (o: DbOpp) => {
      const bm = o.booking_month
      if (!bm) return false
      return bm >= start && bm < end
    }

    const openDeals = all.filter((o) => (o.status ?? 'Open') === 'Open' && (inPeriod(o) || !o.booking_month))
    const wonDeals = all.filter((o) => (o.status ?? 'Open') === 'Won' && inPeriod(o))
    const lostDeals = all.filter((o) => (o.status ?? 'Open') === 'Lost' && inPeriod(o))

    const openCount = openDeals.length
    const wonCount = wonDeals.length
    const lostCount = lostDeals.length
    const dealsCount = all.length

    const pipelineTotal = openDeals.reduce((s, o) => s + dealTotalAmount(o), 0)
    const pipelineWeighted = openDeals.reduce(
      (s, o) => s + weighted(dealTotalAmount(o), clamp(Number(o.prob ?? 0) || 0, 0, 100)),
      0
    )

    const weightedPct = pipelineTotal > 0 ? (pipelineWeighted / pipelineTotal) * 100 : 0

    const commitDeals = openDeals.filter((o) => normText(o.stage).toLowerCase() === 'commit' && inPeriod(o))
    const commitAmount = commitDeals.reduce((s, o) => s + dealTotalAmount(o), 0)

    const wonAmount = wonDeals.reduce((s, o) => s + dealTotalAmount(o), 0)

    // Data quality (sur Open inclus)
    const missingAmount = openDeals.filter((o) => dealTotalAmount(o) <= 0).length
    const missingCloseMonth = openDeals.filter((o) => !o.booking_month).length
    const missingNextStep = openDeals.filter((o) => !normText(o.next_step)).length

    // byStage (Open inclus)
    const byStageMap = new Map<string, { total: number; count: number }>()
    for (const o of openDeals) {
      const st = normText(o.stage) || '—'
      const cur = byStageMap.get(st) || { total: 0, count: 0 }
      cur.total += dealTotalAmount(o)
      cur.count += 1
      byStageMap.set(st, cur)
    }
    const byStage: SummaryByStage[] = Array.from(byStageMap.entries()).map(([stage, v]) => ({
      stage,
      total: v.total,
      count: v.count,
    }))

    // byBu + topVendors + mix (sur Open inclus, via LIGNES multi)
    const byBuMap = new Map<string, { total: number; weighted: number; dealIds: Set<string> }>()
    const vendorMap = new Map<string, { total: number; dealIds: Set<string> }>()
    const clientMap = new Map<
      string,
      { total: number; weighted: number; csg: number; cirs: number; dealIds: Set<string> }
    >()

    for (const o of openDeals) {
      const prob = clamp(Number(o.prob ?? 0) || 0, 0, 100)
      const client = normText(o.accounts?.name) || '—'

      // total deal (client total)
      const dealAmt = dealTotalAmount(o)
      const curClient = clientMap.get(client) || { total: 0, weighted: 0, csg: 0, cirs: 0, dealIds: new Set() }
      curClient.total += dealAmt
      curClient.weighted += weighted(dealAmt, prob)
      curClient.dealIds.add(o.id)
      clientMap.set(client, curClient)

      // lignes
      const lines = explode(o)
      for (const ln of lines) {
        const bu = normBu(ln.bu)
        const vendor = normVendor(ln.vendor)
        const amt = Number(ln.amount || 0) || 0

        const curBu = byBuMap.get(bu) || { total: 0, weighted: 0, dealIds: new Set<string>() }
        curBu.total += amt
        curBu.weighted += weighted(amt, prob)
        curBu.dealIds.add(o.id)
        byBuMap.set(bu, curBu)

        const curV = vendorMap.get(vendor) || { total: 0, dealIds: new Set<string>() }
        curV.total += amt
        curV.dealIds.add(o.id)
        vendorMap.set(vendor, curV)

        // mix CSG vs CIRS (règle simple: BU === 'CSG' => CSG, sinon CIRS)
        if (normText(bu).toUpperCase() === 'CSG') curClient.csg += amt
        else curClient.cirs += amt
      }
    }

    const byBu: SummaryByBu[] = Array.from(byBuMap.entries())
      .map(([bu, v]) => ({ bu, total: v.total, weighted: v.weighted, deals: v.dealIds.size }))
      .sort((a, b) => b.total - a.total)

    const topVendors: SummaryTopVendor[] = Array.from(vendorMap.entries())
      .map(([vendor, v]) => ({ vendor, total: v.total, deals: v.dealIds.size }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12)

    const topClients: SummaryTopClient[] = Array.from(clientMap.entries())
      .map(([client, v]) => ({
        client,
        total: v.total,
        weighted: v.weighted,
        csg: v.csg,
        cirs: v.cirs,
        deals: v.dealIds.size,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12)

    const totalMix = topClients.reduce((s, c) => s + (c.total || 0), 0)
    const totalCsg = topClients.reduce((s, c) => s + (c.csg || 0), 0)
    const mixCsgPct = totalMix > 0 ? (totalCsg / totalMix) * 100 : 0
    const mixCirsPct = 100 - mixCsgPct

    // open/won/lost (montant période)
    const lostAmount = lostDeals.reduce((s, o) => s + dealTotalAmount(o), 0)
    const openWonLost = [
      { name: 'Open' as const, amount: pipelineTotal },
      { name: 'Won' as const, amount: wonAmount },
      { name: 'Lost' as const, amount: lostAmount },
    ]

    // late M-1: deals Open dont booking_month == mois précédent le début de période
    const prev = (() => {
      const y = Number(start.slice(0, 4))
      const m = Number(start.slice(5, 7))
      const p = addMonths(y, m, -1)
      return monthKey(p.y, p.m)
    })()

    const late = all.filter((o) => (o.status ?? 'Open') === 'Open' && o.booking_month === prev)
    const lateAmount = late.reduce((s, o) => s + dealTotalAmount(o), 0)

    const lateM1 =
      late.length === 0
        ? null
        : {
            month: prev,
            count: late.length,
            amount: lateAmount,
            deals: late.slice(0, 50).map((o) => {
              const amt = dealTotalAmount(o)
              const p = clamp(Number(o.prob ?? 0) || 0, 0, 100)
              return {
                id: o.id,
                accountName: normText(o.accounts?.name) || '—',
                title: normText(o.title) || '—',
                bu: normBu(o.bu),
                vendor: normVendor(o.vendor),
                stage: normText(o.stage) || '—',
                status: (o.status ?? 'Open') as any,
                amount: amt,
                prob: p,
                weighted: weighted(amt, p),
                bookingMonth: o.booking_month,
                nextStep: o.next_step ?? '',
              }
            }),
          }

    // lists
    const topOpenDeals: SummaryDeal[] = openDeals
      .slice()
      .sort((a, b) => dealTotalAmount(b) - dealTotalAmount(a))
      .slice(0, 10)
      .map((o) => {
        const amt = dealTotalAmount(o)
        const p = clamp(Number(o.prob ?? 0) || 0, 0, 100)
        return {
          id: o.id,
          accountName: normText(o.accounts?.name) || '—',
          title: normText(o.title) || '—',
          bu: normBu(o.bu),
          vendor: normVendor(o.vendor),
          stage: normText(o.stage) || '—',
          status: (o.status ?? 'Open') as any,
          amount: amt,
          prob: p,
          weighted: weighted(amt, p),
          bookingMonth: o.booking_month,
          nextStep: o.next_step ?? '',
        }
      })

    const topWonDeals: SummaryDeal[] = wonDeals
      .slice()
      .sort((a, b) => dealTotalAmount(b) - dealTotalAmount(a))
      .slice(0, 10)
      .map((o) => {
        const amt = dealTotalAmount(o)
        const p = clamp(Number(o.prob ?? 0) || 0, 0, 100)
        return {
          id: o.id,
          accountName: normText(o.accounts?.name) || '—',
          title: normText(o.title) || '—',
          bu: normBu(o.bu),
          vendor: normVendor(o.vendor),
          stage: normText(o.stage) || '—',
          status: (o.status ?? 'Won') as any,
          amount: amt,
          prob: p,
          weighted: weighted(amt, p),
          bookingMonth: o.booking_month,
          nextStep: o.next_step ?? '',
        }
      })

    const resp: SummaryResponse = {
      year,
      mode,
      month,
      q,
      periodLabel: label,
      kpis: {
        dealsCount,
        openCount,
        wonCount,
        lostCount,
        pipelineTotal,
        pipelineWeighted,
        weightedPct,
        commitAmount,
        commitCount: commitDeals.length,
        wonAmount,
        wonAvgMargin: 0,
        mixCsgPct,
        mixCirsPct,
      },
      dataQuality: {
        missingAmount,
        missingCloseMonth,
        missingNextStep,
        blockedInside: 0,
      },
      byBu,
      byStage,
      topClients,
      topVendors,
      openWonLost,
      lateM1,
      lists: { topOpenDeals, topWonDeals },
    }

    return NextResponse.json(resp, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    console.error('[analytics/summary] Error:', e)
    return NextResponse.json({ error: 'Erreur interne résumé analytique' }, { status: 500 })
  }
}
