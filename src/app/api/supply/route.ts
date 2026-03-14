import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { requireAuth } from '@/lib/apiAuth'

export const runtime = 'nodejs'

// GET: Load all supply_orders with full joins (bypasses RLS)
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  try {
    const { data, error } = await supabaseServer
      .from('supply_orders')
      .select(`
        *,
        opportunities (
          id, title, amount, po_number, po_date, bu, vendor,
          accounts(name),
          purchase_info(id, frais_engagement, payment_terms, notes, purchase_lines(*))
        )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Filter out any lingering a_commander orders
    const validOrders = (data || []).filter((o: any) => o.status !== 'a_commander')

    return NextResponse.json({ orders: validOrders })
  } catch (e: any) {
    console.error('[supply GET]', e)
    return NextResponse.json({ error: e?.message || 'Erreur lecture' }, { status: 500 })
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
    return NextResponse.json({ error: e?.message || 'Erreur mise à jour' }, { status: 500 })
  }
}
