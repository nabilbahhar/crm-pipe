import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Vérifie le token Supabase dans le header Authorization.
 * Retourne { user } si OK, ou une NextResponse 401 sinon.
 */
export async function requireAuth(
  req: NextRequest
): Promise<{ user: { id: string; email?: string } } | NextResponse> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const token = authHeader.slice(7)
  const sb = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user }, error } = await sb.auth.getUser(token)

  if (error || !user) {
    return NextResponse.json({ error: 'Session invalide' }, { status: 401 })
  }

  return { user }
}
