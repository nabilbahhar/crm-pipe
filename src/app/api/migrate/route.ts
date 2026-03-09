import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { requireAuth } from '@/lib/apiAuth'

export const runtime = 'nodejs'

/**
 * POST /api/migrate
 * Check & report on required DB structures.
 * Actual migration SQL must be run in Supabase SQL Editor.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const checks: { table: string; exists: boolean; error?: string }[] = []

    // Check supplier_contacts table
    const { error: e1 } = await supabaseServer.from('supplier_contacts').select('id').limit(1)
    checks.push({ table: 'supplier_contacts', exists: !e1, error: e1?.message })

    // Check purchase_lines has line_status column
    const { data: plTest, error: e2 } = await supabaseServer
      .from('purchase_lines').select('id, line_status, eta').limit(1)
    checks.push({ table: 'purchase_lines.line_status', exists: !e2, error: e2?.message })

    // Check prospect_contacts table
    const { error: e3 } = await supabaseServer.from('prospect_contacts').select('id').limit(1)
    checks.push({ table: 'prospect_contacts', exists: !e3, error: e3?.message })

    const allOk = checks.every(c => c.exists)

    const missingMigrations: string[] = []
    if (!checks[0].exists || !checks[1].exists) missingMigrations.push('009_supplier_contacts_and_line_tracking.sql')
    if (!checks[2].exists) missingMigrations.push('010_prospect_contacts.sql')

    return NextResponse.json({
      allOk,
      checks,
      migrationFile: allOk ? null : `Run in Supabase SQL Editor: ${missingMigrations.join(', ')}`,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Check failed' }, { status: 500 })
  }
}
