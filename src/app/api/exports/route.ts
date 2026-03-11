import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAuth } from "@/lib/apiAuth";
import { fileLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";

function csvEscape(v: any) {
  let s = (v ?? "").toString();
  // ─── Security: Prevent CSV formula injection ───────────────
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toNumber(v: any) {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v.replace(",", ".")) || 0;
  return 0;
}

function pick(row: any, keys: string[]) {
  for (const k of keys) if (row?.[k] !== undefined && row?.[k] !== null) return row[k];
  return undefined;
}

function pickStr(row: any, keys: string[]) {
  const v = pick(row, keys);
  return typeof v === "string" ? v : (v?.toString?.() ?? "");
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
  ]);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeStage(raw: string) {
  const s = (raw || "").toLowerCase();
  if (s.includes("won") || s.includes("gagn")) return "Won";
  if (s.includes("lost") || s.includes("perd") || s.includes("no decision") || s.includes("no-decision")) return "Lost / No decision";
  if (s.includes("commit")) return "Commit";
  if (s.includes("nego")) return "Negotiation";
  if (s.includes("proposal") || s.includes("quote") || s.includes("offre")) return "Proposal Sent";
  if (s.includes("solution")) return "Solutioning";
  if (s.includes("qualif")) return "Qualified";
  if (s.includes("disco")) return "Discovery";
  return "Lead";
}

function ym(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function quarterMonths(q: number) {
  const map: Record<number, number[]> = { 1: [1, 2, 3], 2: [4, 5, 6], 3: [7, 8, 9], 4: [10, 11, 12] };
  return map[q] || [1, 2, 3];
}

function prevMonth(year: number, month: number) {
  if (month <= 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    // ─── Rate limiting: 20 req/min per user ───
    const rl = fileLimiter.check(auth.user.email || auth.user.id);
    if (!rl.ok) return NextResponse.json({ error: rl.error }, { status: 429 });

    const { searchParams } = new URL(req.url);

    const exp = (searchParams.get("export") || "comit_monthly").toLowerCase();
    const year = Number(searchParams.get("year") || new Date().getFullYear());
    const month = Number(searchParams.get("month") || (new Date().getMonth() + 1));
    const q = Number(searchParams.get("q") || 1);

    // Data
    const { data: opps, error: oppErr } = await supabaseServer.from("opportunities").select("*").limit(5000);
    if (oppErr) {
      console.error('[exports] DB error:', oppErr);
      return NextResponse.json({ error: 'Erreur de lecture des données' }, { status: 500 });
    }

    const { data: accs, error: accErr } = await supabaseServer.from("accounts").select("id,name").limit(5000);
    if (accErr) {
      console.error('[exports] DB error:', accErr);
      return NextResponse.json({ error: 'Erreur de lecture des données' }, { status: 500 });
    }

    const accMap = new Map<string, string>();
    for (const a of accs || []) accMap.set(a.id, a.name);

    const rows = (opps || []).map((r: any) => {
      const amount = toNumber(pick(r, ["amount", "amount_mad", "montant", "value"]));
      const prob = Math.max(0, Math.min(100, Math.floor(toNumber(pick(r, ["probability", "prob", "proba"])))));
      const marginPct = toNumber(pick(r, ["margin_pct", "margin", "gross_margin_pct"]));
      const stageRaw = pickStr(r, ["pipeline_status", "stage", "status", "pipeline_stage"]);
      const stage = normalizeStage(stageRaw);
      const bu = (pickStr(r, ["bu", "business_unit"]) || "OTHER").toUpperCase();
      const booking = pickDate(r);

      const accountId = pickStr(r, ["account_id", "client_id"]);
      const accountName = accMap.get(accountId) || pickStr(r, ["account_name", "client"]) || "—";

      const status = stage === "Won" ? "Won" : stage === "Lost / No decision" ? "Lost" : "Open";

      return {
        id: r.id,
        accountName,
        title: pickStr(r, ["title", "deal", "name"]) || "—",
        bu,
        vendor: pickStr(r, ["vendor", "manufacturer", "oem", "constructeur"]) || "—",
        type: pickStr(r, ["type", "deal_type", "pipeline_type"]) || "—",
        stage,
        status,
        amount,
        prob,
        weighted: amount * (prob / 100),
        marginPct,
        bookingMonth: booking ? ym(booking.getFullYear(), booking.getMonth() + 1) : null,
      };
    });

    // filtres période
    let periodLabel = "";
    let filtered: any[] = [];

    if (exp === "comit_quarter") {
      const ms = quarterMonths(q);
      const months = ms.map((m) => ym(year, m));
      periodLabel = `COMIT_Q${q}_${year}`;
      filtered = rows.filter((r) => r.status !== "Lost" && r.bookingMonth && months.includes(r.bookingMonth));
    } else if (exp === "late_m1") {
      const prev = prevMonth(year, month);
      const target = ym(prev.year, prev.month);
      periodLabel = `RETARD_M-1_${target}`;
      // retard = deals encore Open dont bookingMonth <= M-1
      filtered = rows.filter((r) => r.status === "Open" && r.bookingMonth && r.bookingMonth <= target);
    } else if (exp === "pack24") {
      // pack = on exporte la même base que le mensuel sélectionné (tu pourras le faire évoluer)
      const target = ym(year, month);
      periodLabel = `PACK24_${target}`;
      filtered = rows.filter((r) => r.status !== "Lost" && r.bookingMonth === target);
    } else {
      const target = ym(year, month);
      periodLabel = `COMIT_M_${target}`;
      filtered = rows.filter((r) => r.status !== "Lost" && r.bookingMonth === target);
    }

    const open = filtered.filter((r) => r.status === "Open");
    const won = filtered.filter((r) => r.status === "Won");
    const lost = filtered.filter((r) => r.status === "Lost");

    const sum = (arr: any[], key: string) => arr.reduce((a, x) => a + (x[key] || 0), 0);

    const header = [
      ["Export", periodLabel],
      ["Deals_total", filtered.length],
      ["Open_count", open.length],
      ["Won_count", won.length],
      ["Lost_count", lost.length],
      ["Pipeline_total", sum(open, "amount")],
      ["Pipeline_pondere", sum(open, "weighted")],
      ["Won_total", sum(won, "amount")],
      [],
      ["Client", "Deal", "BU", "Vendor", "Type", "Stage", "Status", "Amount_MAD", "Prob_%", "Weighted_MAD", "Margin_%", "BookingMonth"],
    ];

    const lines = [
      ...header.map((row) => row.map(csvEscape).join(",")),
      ...filtered
        .sort((a, b) => (b.amount || 0) - (a.amount || 0))
        .map((r) =>
          [
            r.accountName,
            r.title,
            r.bu,
            r.vendor,
            r.type,
            r.stage,
            r.status,
            Math.round(r.amount || 0),
            r.prob ?? 0,
            Math.round(r.weighted || 0),
            (r.marginPct ?? 0).toFixed(1),
            r.bookingMonth ?? "",
          ]
            .map(csvEscape)
            .join(",")
        ),
    ];

    const csv = lines.join("\n");
    const safeLabel = periodLabel.replace(/[^a-zA-Z0-9_\-.]/g, '_').slice(0, 200)
    const filename = `${safeLabel}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error('[exports] Error:', e);
    return NextResponse.json({ error: 'Erreur interne export' }, { status: 500 });
  }
}
