import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());

  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  const { data, error } = await supabaseServer
    .from("billings")
    .select("billing_date, client_name, bu, amount_mad")
    .gte("billing_date", start)
    .lte("billing_date", end);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];

  let total = 0;
  const byBU: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  const byClient: Record<string, number> = {};

  for (const r of rows) {
    const amt = Number(r.amount_mad ?? 0);
    total += amt;

    const bu = String(r.bu ?? "OTHER");
    byBU[bu] = (byBU[bu] ?? 0) + amt;

    const dt = new Date(String(r.billing_date));
    const mk = monthKey(dt);
    byMonth[mk] = (byMonth[mk] ?? 0) + amt;

    const c = String(r.client_name ?? "N/A");
    byClient[c] = (byClient[c] ?? 0) + amt;
  }

  const topClients = Object.entries(byClient)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([client, amount]) => ({ client, amount }));

  return NextResponse.json({
    year,
    total,
    byBU,
    byMonth,
    topClients,
  });
}
