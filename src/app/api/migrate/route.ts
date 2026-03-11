import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { requireAuth } from '@/lib/apiAuth'
import { migrateLimiter } from '@/lib/rateLimit'

export const runtime = 'nodejs'

// ─── Security: Only allow in development mode ─────────────────
const IS_DEV = process.env.NODE_ENV !== 'production'

/**
 * POST /api/migrate
 * Check & report on required DB structures.
 * Actual migration SQL must be run in Supabase SQL Editor.
 * ⚠️ Restricted to development mode only.
 */
export async function POST(req: NextRequest) {
  try {
    // ─── Security: Block in production to prevent schema disclosure ───
    if (!IS_DEV) {
      return NextResponse.json({ error: 'Non disponible' }, { status: 403 })
    }

    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    // ─── Rate limiting: 2 req/min per user ───
    const rl = migrateLimiter.check(auth.user.email || auth.user.id)
    if (!rl.ok) return NextResponse.json({ error: rl.error }, { status: 429 })

    const checks: { table: string; exists: boolean }[] = []

    // Check supplier_contacts table
    const { error: e1 } = await supabaseServer.from('supplier_contacts').select('id').limit(1)
    checks.push({ table: 'supplier_contacts', exists: !e1 })

    // Check purchase_lines has line_status column
    const { error: e2 } = await supabaseServer
      .from('purchase_lines').select('id, line_status, eta').limit(1)
    checks.push({ table: 'purchase_lines.line_status', exists: !e2 })

    // Check prospect_contacts table
    const { error: e3 } = await supabaseServer.from('prospect_contacts').select('id').limit(1)
    checks.push({ table: 'prospect_contacts', exists: !e3 })

    const allOk = checks.every(c => c.exists)

    return NextResponse.json({
      allOk,
      checks,
      message: allOk ? 'Toutes les migrations sont appliquées' : 'Certaines migrations manquent',
    })
  } catch (e: any) {
    console.error('[migrate] Error:', e)
    return NextResponse.json({ error: 'Erreur interne vérification migrations' }, { status: 500 })
  }
}
