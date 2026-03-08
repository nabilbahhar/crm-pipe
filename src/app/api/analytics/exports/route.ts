import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireAuth } from "@/lib/apiAuth";

export const runtime = "nodejs";

type ExportKind =
  | "comit_monthly"
  | "comit_quarterly"
  | "retard_booking_m1"
  | "pack_revue_24";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function csvEscape(v: any) {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: Record<string, any>[]) {
  const sep = ";";
  const lines: string[] = [];
  lines.push(headers.map(csvEscape).join(sep));
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(sep));
  }
  return lines.join("\n");
}

function pick(row: any, keys: string[]) {
  for (const k of keys) {
    if (row?.[k] !== undefined && row?.[k] !== null) return row[k];
  }
  return undefined;
}

function toNumber(v: any) {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v.replace(",", ".")) || 0;
  return 0;
}

function monthKeyFromAny(v: any) {
  if (!v) return null;
  const s = String(v);
  const m = s.match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }
  return null;
}

function normalizeStage(raw: string) {
  const s = (raw || "").toLowerCase();
  if (s.includes("won") || s.includes("gagn")) return "Won";
  if (
    s.includes("lost") ||
    s.includes("perd") ||
    s.includes("no decision") ||
    s.includes("no-decision")
  )
    return "Lost / No decision";
  if (s.includes("commit")) return "Commit";
  if (s.includes("nego")) return "Negotiation";
  if (s.includes("proposal") || s.includes("quote") || s.includes("offre"))
    return "Proposal Sent";
  if (s.includes("solution")) return "Solutioning";
  if (s.includes("qualif")) return "Qualified";
  if (s.includes("disco")) return "Discovery";
  return "Lead";
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const sp = new URL(req.url).searchParams;

    const now = new Date();
    const year = Number(sp.get("year") || now.getFullYear());
    const month = Number(sp.get("month") || now.getMonth() + 1);
    const quarter = Number(sp.get("quarter") || Math.ceil(month / 3));

    const kindRaw = (
      sp.get("export") ||
      sp.get("kind") ||
      sp.get("type") ||
      "comit_monthly"
    ).toLowerCase();

    const kind: ExportKind = kindRaw.includes("retard")
      ? "retard_booking_m1"
      : kindRaw.includes("trimes") || kindRaw.includes("quarter")
      ? "comit_quarterly"
      : kindRaw.includes("pack") || kindRaw.includes("revue")
      ? "pack_revue_24"
      : "comit_monthly";

    // Comptes
    const { data: accs, error: accErr } = await supabaseServer
      .from("accounts")
      .select("id,name")
      .limit(5000);

    if (accErr)
      return NextResponse.json({ error: accErr.message }, { status: 500 });

    const accMap = new Map<string, string>();
    for (const a of accs || []) accMap.set(a.id, a.name);

    // Opps
    const { data: opps, error: oppErr } = await supabaseServer
      .from("opportunities")
      .select("*")
      .limit(5000);

    if (oppErr)
      return NextResponse.json({ error: oppErr.message }, { status: 500 });

    function getPilotMonth(o: any) {
      const v =
        pick(o, [
          "booking_expected",
          "booking_prevu",
          "expected_booking_date",
          "booking_forecast",
          "booking_date_expected",
        ]) ??
        pick(o, ["booking_date"]) ??
        pick(o, ["close_date", "closing_date"]) ??
        pick(o, ["created_at"]);
      return monthKeyFromAny(v);
    }

    function getStatus(o: any) {
      const stageRaw = String(
        pick(o, ["pipeline_status", "stage", "status", "pipeline_stage"]) || ""
      );
      const stage = normalizeStage(stageRaw);
      if (stage === "Won") return { stage, status: "Won" as const };
      if (stage === "Lost / No decision")
        return { stage, status: "Lost" as const };
      return { stage, status: "Open" as const };
    }

    const mKey = `${year}-${pad2(month)}`;
    const qStartMonth = (Math.min(4, Math.max(1, quarter)) - 1) * 3 + 1;
    const qKeys = [
      `${year}-${pad2(qStartMonth)}`,
      `${year}-${pad2(qStartMonth + 1)}`,
      `${year}-${pad2(qStartMonth + 2)}`,
    ];

    const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const prevKey = `${prevYear}-${pad2(prevMonth)}`;

    let filtered = (opps || []) as any[];

    if (kind === "comit_monthly") {
      filtered = filtered.filter((o) => getPilotMonth(o) === mKey);
    } else if (kind === "comit_quarterly") {
      filtered = filtered.filter((o) => {
        const k = getPilotMonth(o);
        return k ? qKeys.includes(k) : false;
      });
    } else if (kind === "retard_booking_m1") {
      filtered = filtered.filter((o) => {
        if (getPilotMonth(o) !== prevKey) return false;
        return getStatus(o).status === "Open";
      });
    } else if (kind === "pack_revue_24") {
      filtered = filtered.filter((o) => {
        const k = getPilotMonth(o);
        return k ? k.startsWith(`${year}-`) : false;
      });
    }

    const rows = filtered
      .map((o) => {
        const { stage } = getStatus(o);

        const accountId = String(pick(o, ["account_id", "client_id"]) || "");
        const client =
          accMap.get(accountId) ||
          String(pick(o, ["account_name", "client"]) || "—");

        const amount =
          toNumber(pick(o, ["amount", "amount_mad", "montant", "value"])) || 0;
        const prob = Math.max(
          0,
          Math.min(100, Math.floor(toNumber(pick(o, ["probability", "prob", "proba"]))))
        );
        const weighted = Math.round(amount * (prob / 100));

        const bu = String(pick(o, ["bu", "business_unit"]) || "OTHER").toUpperCase();
        const constructor = String(
          pick(o, ["vendor", "manufacturer", "oem", "constructeur", "constructor"]) || ""
        );

        const bookingExpected = String(
          pick(o, [
            "booking_expected",
            "booking_prevu",
            "expected_booking_date",
            "booking_forecast",
            "booking_date_expected",
          ]) || ""
        );
        const bookingReal = String(pick(o, ["booking_date"]) || "");

        const nextStep = String(pick(o, ["next_step", "next_action", "action"]) || "");
        const insideStatus = String(pick(o, ["inside_status"]) || "");
        const marginPct = pick(o, ["margin_pct", "margin", "gross_margin_pct"]);

        const title = String(pick(o, ["title", "deal", "name"]) || "—");

        return {
          Client: client,
          "Nature projet (BU)": bu,
          Constructeur: constructor,
          Deal: title,
          "Montant (MAD)": amount,
          "Prob (%)": prob,
          "Montant pondéré (MAD)": weighted,
          "Date booking (prévu)": bookingExpected,
          "Date booking (réel)": bookingReal,
          Stage: stage,
          "Inside status": insideStatus,
          "Next step": nextStep,
          "Marge (%)": marginPct ?? "",
        };
      })
      .sort((a, b) => (Number(b["Montant (MAD)"]) || 0) - (Number(a["Montant (MAD)"]) || 0));

    const headers = [
      "Client",
      "Nature projet (BU)",
      "Constructeur",
      "Deal",
      "Montant (MAD)",
      "Prob (%)",
      "Montant pondéré (MAD)",
      "Date booking (prévu)",
      "Date booking (réel)",
      "Stage",
      "Inside status",
      "Next step",
      "Marge (%)",
    ];

    let filename = "";
    if (kind === "comit_monthly") filename = `COMIT_Mensuel_${mKey}`;
    if (kind === "comit_quarterly") filename = `COMIT_Trimestriel_${year}_Q${quarter}`;
    if (kind === "retard_booking_m1") filename = `Retard_Booking_M-1_${prevKey}`;
    if (kind === "pack_revue_24") filename = `Pack_Revue_24_${year}`;

    const csv = toCsv(headers, rows);
    const body = "\ufeff" + csv; // BOM Excel

    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
