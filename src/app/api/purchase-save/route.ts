import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { requireAuth } from '@/lib/apiAuth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json()
    const { purchaseInfo, lines, supplyOrder, existingInfoId } = body

    let infoId = existingInfoId

    // 1. Upsert purchase_info
    if (!infoId) {
      const { data, error } = await supabaseServer
        .from('purchase_info')
        .insert(purchaseInfo)
        .select('id')
        .single()
      if (error) throw error
      infoId = data.id
    } else {
      const { error } = await supabaseServer
        .from('purchase_info')
        .update(purchaseInfo)
        .eq('id', infoId)
      if (error) throw error
    }

    // 2. Replace purchase_lines
    const { error: delErr } = await supabaseServer
      .from('purchase_lines')
      .delete()
      .eq('purchase_info_id', infoId)
    if (delErr) throw delErr

    if (lines && lines.length > 0) {
      const rows = lines.map((l: any, i: number) => ({
        ...l,
        purchase_info_id: infoId,
        sort_order: i,
      }))
      const { error: insErr } = await supabaseServer
        .from('purchase_lines')
        .insert(rows)
      if (insErr) throw insErr
    }

    // 3. Upsert supply_order
    if (supplyOrder) {
      const { error: soErr } = await supabaseServer
        .from('supply_orders')
        .upsert(supplyOrder, {
          onConflict: 'opportunity_id',
          ignoreDuplicates: supplyOrder._ignoreDuplicates ?? false,
        })
      if (soErr) throw soErr
    }

    return NextResponse.json({ ok: true, infoId })
  } catch (e: any) {
    console.error('[purchase-save]', e)
    return NextResponse.json(
      { error: e?.message || 'Erreur sauvegarde' },
      { status: 500 }
    )
  }
}
