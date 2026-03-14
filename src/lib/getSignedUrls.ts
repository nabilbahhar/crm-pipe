import { authFetch } from './authFetch'

/**
 * Génère des signed URLs côté serveur pour les fichiers Supabase Storage.
 * Utilise /api/download (service role key) → pas de problème RLS.
 */
export async function getSignedUrls(
  bucket: string,
  files: { id: string; file_url: string }[]
): Promise<Record<string, string>> {
  if (files.length === 0) return {}

  try {
    const paths = files.map(f => f.file_url)
    const res = await authFetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket, paths }),
    })
    if (!res.ok) return {}
    const { urls } = await res.json()

    // Map path → file id for the result
    const result: Record<string, string> = {}
    for (const f of files) {
      if (urls[f.file_url]) result[f.id] = urls[f.file_url]
    }
    return result
  } catch {
    return {}
  }
}
