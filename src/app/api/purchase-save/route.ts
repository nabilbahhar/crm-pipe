import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { requireAuth } from '@/lib/apiAuth'

export const runtime = 'nodejs'

// Known columns in purchase_lines (safe to insert)
const KNOWN_LINE_COLS = new Set([
  'purchase_info_id', 'sort_order', 'ref', 'designation',
  'qty', 'pu_vente', 'pt_vente', 'pu_achat',
  'fournisseur', 'contact_fournisseur', 'email_fournisseur', 'tel_fournisseur',
  'warranty_months', 'license_months', 'warranty_expiry', 'license_expiry',
  'line_status', 'eta', 'eta_updated_at', 'status_note',
  // Columns that may or may not exist yet — will try, fallback without
  'fournisseur_id', 'selected_contact_ids',
])

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
      const rows = lines.map((l: any, i: number) => {
        const row: any = { purchase_info_id: infoId, sort_order: i }
        for (const key of Object.keys(l)) {
          if (KNOWN_LINE_COLS.has(key)) row[key] = l[key]
        }
        return row
      })

      // Try insert with all columns first
      let { error: insErr } = await supabaseServer
        .from('purchase_lines')
        .insert(rows)

      // If error mentions unknown column, retry without fournisseur_id & selected_contact_ids
      if (insErr && (insErr.message?.includes('fournisseur_id') || insErr.message?.includes('selected_contact_ids') || insErr.message?.includes('schema cache'))) {
        console.warn('[purchase-save] Retrying without fournisseur_id/selected_contact_ids:', insErr.message)
        const safeRows = rows.map((r: any) => {
          const { fournisseur_id, selected_contact_ids, ...rest } = r
          return rest
        })
        const retry = await supabaseServer
          .from('purchase_lines')
          .insert(safeRows)
        insErr = retry.error
      }
      if (insErr) throw insErr
    }

    // 3. Upsert supply_order (remove internal _ignoreDuplicates flag)
    if (supplyOrder) {
      const { _ignoreDuplicates, ...soData } = supplyOrder
      const { error: soErr } = await supabaseServer
        .from('supply_orders')
        .upsert(soData, {
          onConflict: 'opportunity_id',
          ignoreDuplicates: _ignoreDuplicates ?? false,
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
