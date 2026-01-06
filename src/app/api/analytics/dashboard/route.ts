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
    'booking_expected',
    'booking_prevu',
    'expected_booking_date',
    'booking_forecast',
    'booking_date_expected',
    'booking_date',
    'close_date',
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const year = Number(searchParams.get('year') || new Date().getFullYear())

    const { data: opps, error: oppErr } = await supabaseServer
      .from('opportunities')
      .select('*')
      .limit(5000)

    if (oppErr) return NextResponse.json({ error: oppErr.message }, { status: 500 })

    const { data: accs, error: accErr } = await supabaseServer
      .from('accounts')
      .select('id,name')
      .limit(5000)

    if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 })

    const accMap = new Map<string, string>()
    for (const a of accs || []) accMap.set(a.id, a.name)

    const rows = (opps || []).map((r: any) => {
      const amount = toNumber(pick(r, ['amount', 'amount_mad', 'montant', 'value'])) // MAD
      const prob = Math.max(0, Math.min(100, Math.floor(toNumber(pick(r, ['probability', 'prob', 'proba'])))))
      const marginPct = toNumber(pick(r, ['margin_pct', 'margin', 'gross_margin_pct']))
      const stageRaw = pickStr(r, ['pipeline_status', 'stage', 'status', 'pipeline_stage'])
      const stage = normalizeStage(stageRaw)
      const bu = (pickStr(r, ['bu', 'business_unit']) || 'OTHER').toUpperCase()
      const booking = pickDate(r)
      const insideStatus = pickStr(r, ['inside_status']) || '—'
      const nextStep = pickStr(r, ['next_step', 'next_action', 'action']) || '—'
      const vendor = pickStr(r, ['vendor', 'manufacturer', 'oem', 'constructeur']) || ''
      const type = pickStr(r, ['type', 'deal_type', 'pipeline_type']) || ''

      const accountId = pickStr(r, ['account_id', 'client_id'])
      const accountName = accMap.get(accountId) || pickStr(r, ['account_name', 'client']) || '—'

      const status =
        stage === 'Won' ? 'Won' : stage === 'Lost / No decision' ? 'Lost' : 'Open'

      return {
        id: r.id,
        accountId,
        accountName,
        title: pickStr(r, ['title', 'deal', 'name']) || '—',
        bu,
        type,
        vendor,
        stage,
        status,
        amount,
        prob,
        weighted: amount * (prob / 100),
        marginPct,
        booking: booking ? booking.toISOString().slice(0, 10) : null,
        bookingYear: booking ? booking.getFullYear() : null,
        bookingMonth: booking ? `${booking.getFullYear()}-${String(booking.getMonth() + 1).padStart(2, '0')}` : null,
        insideStatus,
        nextStep,
      }
    })

    // filtre par année si une date booking existe, sinon on garde tout
    const hasBooking = rows.some(r => r.bookingYear !== null)
    const rowsYear = hasBooking ? rows.filter(r => r.bookingYear === year) : rows

    const open = rowsYear.filter(r => r.status === 'Open')
    const won = rowsYear.filter(r => r.status === 'Won')
    const lost = rowsYear.filter(r => r.status === 'Lost')

    const sum = (arr: any[], key: string) => arr.reduce((a, x) => a + (x[key] || 0), 0)

    const pipelineTotal = sum(open, 'amount')
    const pipelineWeighted = sum(open, 'weighted')
    const wonAmount = sum(won, 'amount')

    const avgMargin =
      open.reduce((acc, d) => acc + (d.amount > 0 ? d.marginPct * d.amount : 0), 0) /
      (open.reduce((acc, d) => acc + (d.amount > 0 ? d.amount : 0), 0) || 1)

    const csgAmount = open.filter(d => d.bu === 'CSG').reduce((a, d) => a + d.amount, 0)
    const mixCsgPct = pipelineTotal > 0 ? (csgAmount / pipelineTotal) * 100 : 0

    const stagesOrder = ['Lead','Discovery','Qualified','Solutioning','Proposal Sent','Negotiation','Commit','Won','Lost / No decision']
    const byStage = stagesOrder.map(stage => {
      const arr = rowsYear.filter(d => d.stage === stage && d.status !== 'Lost')
      return { stage, total: arr.reduce((a,d)=>a+d.amount,0), count: arr.length }
    })

    const bus = Array.from(new Set(rowsYear.map(d => d.bu))).sort()
    const byBu = bus.map(bu => {
      const arr = open.filter(d => d.bu === bu)
      const total = arr.reduce((a,d)=>a+d.amount,0)
      const weighted = arr.reduce((a,d)=>a+d.weighted,0)
      const m =
        arr.reduce((acc, d) => acc + (d.amount > 0 ? d.marginPct * d.amount : 0), 0) /
        (arr.reduce((acc, d) => acc + (d.amount > 0 ? d.amount : 0), 0) || 1)
      return { bu, total, weighted, avgMargin: m }
    })

    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
    const byMonth = months.map(m => {
      const arr = rowsYear.filter(d => d.bookingMonth === m)
      const total = arr.filter(d => d.status !== 'Lost').reduce((a,d)=>a+d.amount,0)
      const weighted = arr.filter(d => d.status === 'Open').reduce((a,d)=>a+d.weighted,0)
      const commit = arr.filter(d => d.stage === 'Commit').reduce((a,d)=>a+d.amount,0)
      const wonM = arr.filter(d => d.status === 'Won').reduce((a,d)=>a+d.amount,0)
      return { month: m, total, weighted, commit, won: wonM }
    })

    const openWonLost = [
      { name: 'Open', amount: sum(open, 'amount') },
      { name: 'Won', amount: sum(won, 'amount') },
      { name: 'Lost', amount: sum(lost, 'amount') },
    ]

    const topDeals = [...open].sort((a,b)=>b.amount-a.amount).slice(0, 10)

    return NextResponse.json({
      year,
      kpis: {
        dealsCount: rowsYear.length,
        pipelineTotal,
        pipelineWeighted,
        avgMargin,
        wonAmount,
        mixCsgPct,
      },
      byBu,
      byStage,
      byMonth,
      openWonLost,
      topDeals,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}
