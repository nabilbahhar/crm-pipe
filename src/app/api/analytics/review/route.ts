import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

function toNumber(v: any) {
  if (typeof v === 'number') return v
  if (typeof v === 'string') return parseFloat(v.replace(',', '.')) || 0
  return 0
}

function pick(row: any, keys: string[]) {
  for (const k of keys) if (row?.[k] !== undefined && row?.[k] !== null) return row[k]
  return undefined
}

function pickStr(row: any, keys: string[]) {
  const v = pick(row, keys)
  return typeof v === 'string' ? v : (v?.toString?.() ?? '')
}

function pickDate(row: any) {
  const v = pick(row, [
    // on garde large pour coller à tes colonnes existantes
    'closing_date',
    'close_date',
    'booking_expected',
    'booking_prevu',
    'expected_booking_date',
    'booking_forecast',
    'booking_date_expected',
    'booking_date',
  ])
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function normalizeStage(raw: string) {
  const s = (raw || '').toLowerCase()
  if (s.includes('won') || s.includes('gagn')) return 'Won'
  if (s.includes('lost') || s.includes('perd') || s.includes('no decision') || s.includes('no-decision')) return 'Lost / No decision'
  if (s.includes('commit')) return 'Commit'
  if (s.includes('nego')) return 'Negotiation'
  if (s.includes('proposal') || s.includes('quote') || s.includes('offre')) return 'Proposal Sent'
  if (s.includes('solution')) return 'Solutioning'
  if (s.includes('qualif')) return 'Qualified'
  if (s.includes('disco')) return 'Discovery'
  return 'Lead'
}

function normalizeBU(raw: string) {
  const s = (raw || '').trim()
  if (!s) return 'OTHER'
  return s.toUpperCase()
}

function isCSG(bu: string) {
  return (bu || '').toUpperCase() === 'CSG'
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthsOfQuarter(year: number, q: number) {
  const start = (q - 1) * 3 + 1
  return [0, 1, 2].map((i) => `${year}-${String(start + i).padStart(2, '0')}`)
}

function prevMonthKey(year: number, month: number) {
  const d = new Date(year, month - 1, 1) // month: 1..12
  d.setMonth(d.getMonth() - 1)
  return monthKey(d)
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const year = Number(searchParams.get('year') || new Date().getFullYear())
    const mode = (searchParams.get('mode') || 'year').toLowerCase() // 'monthly' | 'quarter' | 'year'
    const month = Number(searchParams.get('month') || 0) // 1..12
    const q = Number(searchParams.get('q') || 0) // 1..4

    // 1) fetch opportunities + accounts
    const { data: opps, error: oppErr } = await supabaseServer
      .from('opportunities')
      .select('*')
      .limit(10000)

    if (oppErr) return NextResponse.json({ error: oppErr.message }, { status: 500 })

    const { data: accs, error: accErr } = await supabaseServer
      .from('accounts')
      .select('id,name')
      .limit(10000)

    if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 })

    const accMap = new Map<string, string>()
    for (const a of accs || []) accMap.set(a.id, a.name)

    // 2) normalize rows
    const rows = (opps || []).map((r: any) => {
      const amount = toNumber(pick(r, ['amount', 'amount_mad', 'montant', 'value']))
      const prob = Math.max(0, Math.min(100, Math.floor(toNumber(pick(r, ['probability', 'prob', 'proba'])))))
      const marginPct = toNumber(pick(r, ['margin_pct', 'margin', 'gross_margin_pct']))

      const stageRaw = pickStr(r, ['pipeline_status', 'stage', 'status', 'pipeline_stage'])
      const stage = normalizeStage(stageRaw)

      const bu = normalizeBU(pickStr(r, ['bu', 'business_unit']))

      const d = pickDate(r)
      const bookingMonth = d ? monthKey(d) : null
      const bookingYear = d ? d.getFullYear() : null

      const accountId = pickStr(r, ['account_id', 'client_id'])
      const accountName = accMap.get(accountId) || pickStr(r, ['account_name', 'client']) || '—'

      const vendor = pickStr(r, ['vendor', 'manufacturer', 'oem', 'constructeur']) || ''
      const type = pickStr(r, ['type', 'deal_type', 'pipeline_type']) || ''

      const insideStatus = pickStr(r, ['inside_status']) || '—'
      const nextStep = pickStr(r, ['next_step', 'next_action', 'action']) || ''

      const status =
        stage === 'Won' ? 'Won' : stage === 'Lost / No decision' ? 'Lost' : 'Open'

      return {
        id: r.id as string,
        accountId,
        accountName,
        title: pickStr(r, ['title', 'deal', 'name']) || '—',
        bu,
        vendor,
        type,
        stage,
        status,
        amount,
        prob,
        weighted: amount * (prob / 100),
        marginPct,
        bookingMonth,
        bookingYear,
        insideStatus,
        nextStep,
      }
    })

    // 3) Filter by year if bookingYear is available somewhere
    const hasBooking = rows.some(r => r.bookingYear !== null)
    const rowsYear = hasBooking ? rows.filter(r => r.bookingYear === year) : rows

    // 4) Period filter
    let monthsFilter: string[] | null = null
    let periodLabel = `Année ${year}`

    if (mode === 'monthly') {
      if (!(month >= 1 && month <= 12)) {
        return NextResponse.json({ error: 'Paramètre month requis (1..12) pour mode=monthly.' }, { status: 400 })
      }
      const mk = `${year}-${String(month).padStart(2, '0')}`
      monthsFilter = [mk]
      periodLabel = `Mois ${mk}`
    } else if (mode === 'quarter') {
      if (!(q >= 1 && q <= 4)) {
        return NextResponse.json({ error: 'Paramètre q requis (1..4) pour mode=quarter.' }, { status: 400 })
      }
      monthsFilter = monthsOfQuarter(year, q)
      periodLabel = `Trimestre Q${q} ${year}`
    }

    const rowsPeriod = monthsFilter
      ? rowsYear.filter(r => r.bookingMonth && monthsFilter!.includes(r.bookingMonth))
      : rowsYear

    const open = rowsPeriod.filter(r => r.status === 'Open')
    const won = rowsPeriod.filter(r => r.status === 'Won')
    const lost = rowsPeriod.filter(r => r.status === 'Lost')

    const sum = (arr: any[], key: string) => arr.reduce((a, x) => a + (x[key] || 0), 0)

    const pipelineTotal = sum(open, 'amount')
    const pipelineWeighted = sum(open, 'weighted')
    const weightedPct = pipelineTotal > 0 ? (pipelineWeighted / pipelineTotal) * 100 : 0

    const commitDeals = open.filter(r => r.stage === 'Commit')
    const commitAmount = sum(commitDeals, 'amount')
    const commitCount = commitDeals.length

    const wonAmount = sum(won, 'amount')
    const wonCount = won.length
    const wonAvgMargin =
      won.reduce((acc, d) => acc + (d.amount > 0 ? d.marginPct * d.amount : 0), 0) /
      (won.reduce((acc, d) => acc + (d.amount > 0 ? d.amount : 0), 0) || 1)

    const csgOpen = open.filter(d => isCSG(d.bu))
    const cirsOpen = open.filter(d => !isCSG(d.bu))

    const csgAmount = sum(csgOpen, 'amount')
    const cirsAmount = sum(cirsOpen, 'amount')
    const mixCirsPct = pipelineTotal > 0 ? (cirsAmount / pipelineTotal) * 100 : 0
    const mixCsgPct = pipelineTotal > 0 ? (csgAmount / pipelineTotal) * 100 : 0

    // Data quality
    const dq = {
      missingAmount: rowsPeriod.filter(r => !(r.amount > 0)).length,
      missingCloseMonth: rowsPeriod.filter(r => !r.bookingMonth).length,
      missingNextStep: rowsPeriod.filter(r => !r.nextStep || r.nextStep.trim().length === 0).length,
      blockedInside: rowsPeriod.filter(r => (r.insideStatus || '').toUpperCase().includes('BLOCK')).length,
    }

    // Top clients (Open pipeline) + split CSG/CIRS
    const clientAgg = new Map<string, { client: string; total: number; weighted: number; csg: number; cirs: number; deals: number }>()
    for (const r of open) {
      const key = r.accountName || '—'
      const cur = clientAgg.get(key) || { client: key, total: 0, weighted: 0, csg: 0, cirs: 0, deals: 0 }
      cur.total += r.amount
      cur.weighted += r.weighted
      cur.deals += 1
      if (isCSG(r.bu)) cur.csg += r.amount
      else cur.cirs += r.amount
      clientAgg.set(key, cur)
    }
    const topClients = [...clientAgg.values()].sort((a, b) => b.total - a.total).slice(0, 10)

    // Top vendors (Open pipeline)
    const vendorAgg = new Map<string, { vendor: string; total: number; deals: number }>()
    for (const r of open) {
      const v = (r.vendor || '').trim() || '—'
      const cur = vendorAgg.get(v) || { vendor: v, total: 0, deals: 0 }
      cur.total += r.amount
      cur.deals += 1
      vendorAgg.set(v, cur)
    }
    const topVendors = [...vendorAgg.values()].sort((a, b) => b.total - a.total).slice(0, 10)

    // By BU (Open)
    const buAgg = new Map<string, { bu: string; total: number; weighted: number; deals: number }>()
    for (const r of open) {
      const b = r.bu || 'OTHER'
      const cur = buAgg.get(b) || { bu: b, total: 0, weighted: 0, deals: 0 }
      cur.total += r.amount
      cur.weighted += r.weighted
      cur.deals += 1
      buAgg.set(b, cur)
    }
    const byBu = [...buAgg.values()].sort((a, b) => b.total - a.total)

    // By stage (Period, include Won/Lost for lecture)
    const stagesOrder = ['Lead','Discovery','Qualified','Solutioning','Proposal Sent','Negotiation','Commit','Won','Lost / No decision']
    const byStage = stagesOrder.map((st) => {
      const arr = rowsPeriod.filter(r => r.stage === st)
      return { stage: st, total: sum(arr, 'amount'), count: arr.length }
    })

    // Late M-1 (only for monthly)
    let lateM1: any = null
    if (mode === 'monthly' && month >= 1 && month <= 12) {
      const pm = prevMonthKey(year, month)
      const late = rowsYear.filter(r =>
        r.bookingMonth === pm && r.status === 'Open'
      )
      lateM1 = {
        month: pm,
        count: late.length,
        amount: sum(late, 'amount'),
        weighted: sum(late, 'weighted'),
        sample: late.sort((a, b) => b.amount - a.amount).slice(0, 10),
      }
    }

    // Deal lists (for review pages)
    const topOpenDeals = [...open].sort((a, b) => b.amount - a.amount).slice(0, 25)
    const topWonDeals = [...won].sort((a, b) => b.amount - a.amount).slice(0, 25)
    const blocked = [...open].filter(r => (r.insideStatus || '').toUpperCase().includes('BLOCK')).slice(0, 25)

    return NextResponse.json({
      year,
      mode,
      month: mode === 'monthly' ? month : null,
      q: mode === 'quarter' ? q : null,
      periodLabel,
      kpis: {
        dealsCount: rowsPeriod.length,
        openCount: open.length,
        wonCount,
        lostCount: lost.length,

        pipelineTotal,
        pipelineWeighted,
        weightedPct,

        commitAmount,
        commitCount,

        wonAmount,
        wonAvgMargin,

        mixCsgPct,
        mixCirsPct,
      },
      dataQuality: dq,
      byBu,
      byStage,
      topClients,
      topVendors,
      lateM1,
      lists: {
        topOpenDeals,
        topWonDeals,
        blocked,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}
