import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { requireAuth } from '@/lib/apiAuth'

/**
 * POST /api/download
 * Génère des signed URLs côté serveur (service role key → pas de problème RLS)
 * Body: { bucket: string, paths: string[] }
 * Retourne: { urls: Record<string, string> }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  try {
    const { bucket, paths } = await req.json()

    if (!bucket || !Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json({ error: 'bucket et paths requis' }, { status: 400 })
    }

    const ALLOWED_BUCKETS = ['deal-files', 'account-files', 'expense-files', 'profile-avatars', 'team-files']
    if (!ALLOWED_BUCKETS.includes(bucket)) {
      return NextResponse.json({ error: 'Bucket non autorisé' }, { status: 400 })
    }

    if (paths.length > 50) {
      return NextResponse.json({ error: 'Max 50 fichiers par requête' }, { status: 400 })
    }

    const urls: Record<string, string> = {}
    await Promise.all(paths.map(async (p: string) => {
      const { data, error } = await supabaseServer.storage.from(bucket).createSignedUrl(p, 3600)
      if (data?.signedUrl) urls[p] = data.signedUrl
    }))

    return NextResponse.json({ urls })
  } catch (e: any) {
    console.error('[download] Error:', e)
    return NextResponse.json({ error: 'Erreur serveur téléchargement' }, { status: 500 })
  }
}
