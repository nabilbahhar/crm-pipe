import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { requireAuth } from '@/lib/apiAuth'

export const runtime = 'nodejs'

// GET: Load all supply_orders with full joins (bypasses RLS)
// NOTE: purchase_info has no FK to opportunities in Supabase schema,
// so we do two queries and merge manually.
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  try {
    // 1. Load supply_orders with opportunity + account info
    const { data: orders, error: ordErr } = await supabaseServer
      .from('supply_orders')
      .select(`
        *,
        opportunities (
          id, title, amount, po_number, po_date, bu, vendor,
          accounts(name)
        )
      `)
      .order('created_at', { ascending: false })

    if (ordErr) throw ordErr

    const validOrders = (orders || [])

    if (validOrders.length === 0) {
      return NextResponse.json({ orders: [] })
    }

    // 2. Get all opportunity_ids from these orders
    const oppIds = validOrders
      .map((o: any) => o.opportunity_id)
      .filter(Boolean)

    // 3. Load purchase_info + purchase_lines for those opportunities
    const { data: purchaseData, error: piErr } = await supabaseServer
      .from('purchase_info')
      .select('*, purchase_lines(*)')
      .in('opportunity_id', oppIds)

    if (piErr) throw piErr

    // 4. Build a map: opportunity_id → purchase_info (with lines)
    const piMap: Record<string, any> = {}
    for (const pi of purchaseData || []) {
      piMap[pi.opportunity_id] = pi
    }

    // 4b. Load invoices with linked lines for these opportunities
    const { data: invoiceData } = await supabaseServer
      .from('invoices')
      .select('id, opportunity_id, invoice_number, amount, status, issue_date, due_date, invoice_lines(purchase_line_id)')
      .in('opportunity_id', oppIds)
      .order('created_at', { ascending: false })

    // Build map: opportunity_id → invoices[]
    const invMap: Record<string, any[]> = {}
    for (const inv of invoiceData || []) {
      if (!invMap[inv.opportunity_id]) invMap[inv.opportunity_id] = []
      invMap[inv.opportunity_id].push(inv)
    }

    // 5. Merge purchase_info + invoices into each order's opportunities object
    const merged = validOrders.map((o: any) => {
      const opp = o.opportunities
      if (opp) {
        const pi = piMap[opp.id]
        opp.purchase_info = pi ? [pi] : []
      }
      o.invoices = invMap[o.opportunity_id] || []
      return o
    })

    return NextResponse.json({ orders: merged })
  } catch (e: any) {
    console.error('[supply GET]', e)
    return NextResponse.json({ error: 'Erreur lecture supply' }, { status: 500 })
  }
}

// PATCH: Update supply_order or purchase_line
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json()
    const { orderId, lineId, updates } = body

    // Update a purchase_line
    if (lineId) {
      const { error } = await supabaseServer
        .from('purchase_lines')
        .update(updates)
        .eq('id', lineId)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    // Update a supply_order
    if (orderId) {
      const { error } = await supabaseServer
        .from('supply_orders')
        .update(updates)
        .eq('id', orderId)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'orderId ou lineId requis' }, { status: 400 })
  } catch (e: any) {
    console.error('[supply PATCH]', e)
    return NextResponse.json({ error: 'Erreur mise à jour supply' }, { status: 500 })
  }
}

// DELETE: Remove a supply_order (resets deal to Won without placed order)
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(req.url)
    const orderId = searchParams.get('orderId')

    if (!orderId) {
      return NextResponse.json({ error: 'orderId requis' }, { status: 400 })
    }

    const { error } = await supabaseServer
      .from('supply_orders')
      .delete()
      .eq('id', orderId)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[supply DELETE]', e)
    return NextResponse.json({ error: 'Erreur suppression supply' }, { status: 500 })
  }
}
