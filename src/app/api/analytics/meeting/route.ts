import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabaseServer"
import { requireAuth } from "@/lib/apiAuth"
import { analyticsLimiter } from "@/lib/rateLimit"

export const runtime = "nodejs"

function toNumber(v: any) {
  if (typeof v === "number") return v
  if (typeof v === "string") return parseFloat(v.replace(",", ".")) || 0
  return 0
}

function pick(row: any, keys: string[]) {
  for (const k of keys) if (row?.[k] !== undefined && row?.[k] !== null) return row[k]
  return undefined
}

function pickStr(row: any, keys: string[]) {
  const v = pick(row, keys)
  return typeof v === "string" ? v : (v?.toString?.() ?? "")
}

function pickDate(row: any) {
  const v = pick(row, [
    "booking_expected",
    "booking_prevu",
    "expected_booking_date",
    "booking_forecast",
    "booking_date_expected",
    "booking_date",
    "close_date",
    "closing_date",
  ])
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function normalizeStage(raw: string) {
  const s = (raw || "").toLowerCase()
  if (s.includes("won") || s.includes("gagn")) return "Won"
  if (s.includes("lost") || s.includes("perd") || s.includes("no decision") || s.includes("no-decision"))
    return "Lost / No decision"
  if (s.includes("commit")) return "Commit"
  if (s.includes("nego")) return "Negotiation"
  if (s.includes("proposal") || s.includes("quote") || s.includes("offre")) return "Proposal Sent"
  if (s.includes("solution")) return "Solutioning"
  if (s.includes("qualif")) return "Qualified"
  if (s.includes("disco")) return "Discovery"
  return "Lead"
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`
}

function quarterMonths(year: number, q: number) {
  const start = (q - 1) * 3 + 1
  return [monthKey(year, start), monthKey(year, start + 1), monthKey(year, start + 2)]
}

function prevMonth(year: number, month: number) {
  if (month > 1) return { year, month: month - 1 }
  return { year: year - 1, month: 12 }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    // ─── Rate limiting: 30 req/min per user ───
    const rl = analyticsLimiter.check(auth.user.email || auth.user.id)
    if (!rl.ok) return NextResponse.json({ error: rl.error }, { status: 429 })

    const { searchParams } = new URL(req.url)

    const year = Math.max(2020, Math.min(2100, Number(searchParams.get("year") || new Date().getFullYear())))
    const mode = (searchParams.get("mode") || "year") as "year" | "month" | "quarter"
    const month = searchParams.get("month") ? Math.max(1, Math.min(12, Number(searchParams.get("month")))) : null
    const q = searchParams.get("q") ? Math.max(1, Math.min(4, Number(searchParams.get("q")))) : null

    // 1) Load data
    const { data: opps, error: oppErr } = await supabaseServer.from("opportunities").select("*").limit(5000)
    if (oppErr) {
      console.error('[analytics/meeting] oppErr:', oppErr.message)
      return NextResponse.json({ error: 'Erreur chargement opportunités' }, { status: 500 })
    }

    const { data: accs, error: accErr } = await supabaseServer.from("accounts").select("id,name").limit(5000)
    if (accErr) {
      console.error('[analytics/meeting] accErr:', accErr.message)
      return NextResponse.json({ error: 'Erreur chargement comptes' }, { status: 500 })
    }

    const accMap = new Map<string, string>()
    for (const a of accs || []) accMap.set(a.id, a.name)

    const rows = (opps || []).map((r: any) => {
      const amount = toNumber(pick(r, ["amount", "amount_mad", "montant", "value"]))
      const prob = Math.max(0, Math.min(100, Math.floor(toNumber(pick(r, ["probability", "prob", "proba"])))))
      const marginPct = toNumber(pick(r, ["margin_pct", "margin", "gross_margin_pct"]))

      const stageRaw = pickStr(r, ["pipeline_status", "stage", "status", "pipeline_stage"])
      const stage = normalizeStage(stageRaw)

      const bu = (pickStr(r, ["bu", "business_unit"]) || "OTHER").toUpperCase()

      const booking = pickDate(r)
      const bookingYear = booking ? booking.getFullYear() : null
      const bookingMonth = booking
        ? `${booking.getFullYear()}-${String(booking.getMonth() + 1).padStart(2, "0")}`
        : null

      const accountId = pickStr(r, ["account_id", "client_id"])
      const accountName = accMap.get(accountId) || pickStr(r, ["account_name", "client"]) || "—"

      const insideStatus = pickStr(r, ["inside_status"]) || "—"
      const nextStep = pickStr(r, ["next_step", "next_action", "action"]) || "—"
      const vendor = pickStr(r, ["vendor", "manufacturer", "oem", "constructeur"]) || ""
      const type = pickStr(r, ["type", "deal_type", "pipeline_type"]) || ""

      const status = stage === "Won" ? "Won" : stage === "Lost / No decision" ? "Lost" : "Open"

      return {
        id: r.id,
        accountId,
        accountName,
        title: pickStr(r, ["title", "deal", "name"]) || "—",
        bu,
        vendor,
        type,
        stage,
        status,
        amount,
        prob,
        weighted: amount * (prob / 100),
        marginPct,
        bookingYear,
        bookingMonth,
        insideStatus,
        nextStep,
      }
    })

    // 2) Determine period
    let months: string[] | null = null
    let periodLabel = `Année ${year}`

    if (mode === "month") {
      const m = month || new Date().getMonth() + 1
      months = [monthKey(year, m)]
      periodLabel = `Mensuel ${months[0]}`
    } else if (mode === "quarter") {
      const qq = q || 1
      months = quarterMonths(year, qq)
      periodLabel = `Trimestre Q${qq} ${year}`
    }

    // 3) Filter rows for period (using bookingMonth)
    const periodRows = months
      ? rows.filter((r) => r.bookingYear === year && r.bookingMonth && months!.includes(r.bookingMonth))
      : rows.filter((r) => r.bookingYear === year) // year mode = all rows in year with bookingYear

    const open = periodRows.filter((r) => r.status === "Open")
    const won = periodRows.filter((r) => r.status === "Won")
    const lost = periodRows.filter((r) => r.status === "Lost")

    const sum = (arr: any[], key: string) => arr.reduce((a, x) => a + (x[key] || 0), 0)

    const pipelineTotal = sum(open, "amount")
    const pipelineWeighted = sum(open, "weighted")
    const weightedPct = pipelineTotal > 0 ? (pipelineWeighted / pipelineTotal) * 100 : 0

    const commitDeals = open.filter((d) => d.stage === "Commit")
    const commitAmount = sum(commitDeals, "amount")
    const commitCount = commitDeals.length

    const wonAmount = sum(won, "amount")
    const wonAvgMargin =
      won.reduce((acc, d) => acc + (d.amount > 0 ? d.marginPct * d.amount : 0), 0) /
      (won.reduce((acc, d) => acc + (d.amount > 0 ? d.amount : 0), 0) || 1)

    const csgOpen = open.filter((d) => d.bu === "CSG").reduce((a, d) => a + d.amount, 0)
    const mixCsgPct = pipelineTotal > 0 ? (csgOpen / pipelineTotal) * 100 : 0
    const mixCirsPct = Math.max(0, 100 - mixCsgPct)

    const missingAmount = periodRows.filter((d) => !d.amount || d.amount <= 0).length
    const missingCloseMonth = periodRows.filter((d) => !d.bookingMonth).length
    const missingNextStep = periodRows.filter((d) => !d.nextStep || d.nextStep === "—").length
    const blockedInside = periodRows.filter((d) => (d.insideStatus || "").toLowerCase().includes("blocked")).length

    const bus = Array.from(new Set(open.map((d) => d.bu))).sort()
    const byBu = bus.map((bu) => {
      const arr = open.filter((d) => d.bu === bu)
      return {
        bu,
        total: arr.reduce((a, d) => a + d.amount, 0),
        weighted: arr.reduce((a, d) => a + d.weighted, 0),
        deals: arr.length,
      }
    })

    const stagesOrder = [
      "Lead",
      "Discovery",
      "Qualified",
      "Solutioning",
      "Proposal Sent",
      "Negotiation",
      "Commit",
      "Won",
      "Lost / No decision",
    ]
    const byStage = stagesOrder.map((stage) => {
      const arr = periodRows.filter((d) => d.stage === stage)
      return { stage, total: arr.reduce((a, d) => a + d.amount, 0), count: arr.length }
    })

    // Top clients (open only)
    const topClientsMap = new Map<string, { client: string; total: number; weighted: number; csg: number; cirs: number; deals: number }>()
    for (const d of open) {
      const key = d.accountName || "—"
      const cur = topClientsMap.get(key) || { client: key, total: 0, weighted: 0, csg: 0, cirs: 0, deals: 0 }
      cur.total += d.amount
      cur.weighted += d.weighted
      cur.deals += 1
      if (d.bu === "CSG") cur.csg += d.amount
      else cur.cirs += d.amount
      topClientsMap.set(key, cur)
    }
    const topClients = [...topClientsMap.values()].sort((a, b) => b.total - a.total).slice(0, 10)

    const openWonLost = [
      { name: "Open", amount: sum(open, "amount") },
      { name: "Won", amount: sum(won, "amount") },
      { name: "Lost", amount: sum(lost, "amount") },
    ]

    const topOpenDeals = [...open].sort((a, b) => b.amount - a.amount).slice(0, 15)

    // Late M-1 (only meaningful for monthly)
    let lateM1: any = null
    if (mode === "month") {
      const m = month || new Date().getMonth() + 1
      const pm = prevMonth(year, m)
      const key = monthKey(pm.year, pm.month)
      const late = rows.filter((r) => r.status === "Open" && r.bookingMonth === key)
      lateM1 = {
        month: key,
        count: late.length,
        amount: late.reduce((a, d) => a + d.amount, 0),
        deals: late.sort((a, b) => b.amount - a.amount).slice(0, 30),
      }
    }

    return NextResponse.json({
      year,
      mode,
      month,
      q,
      periodLabel,
      kpis: {
        dealsCount: periodRows.length,
        openCount: open.length,
        wonCount: won.length,
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
      dataQuality: {
        missingAmount,
        missingCloseMonth,
        missingNextStep,
        blockedInside,
      },
      byBu,
      byStage,
      topClients,
      openWonLost,
      lateM1,
      lists: {
        topOpenDeals,
      },
    })
  } catch (e: any) {
    console.error('[analytics/meeting] Error:', e)
    return NextResponse.json({ error: 'Erreur interne meeting' }, { status: 500 })
  }
}
