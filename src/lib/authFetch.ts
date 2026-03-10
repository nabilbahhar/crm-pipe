import { supabase } from './supabaseClient'

/**
 * Wrapper fetch qui ajoute automatiquement le token Supabase
 * dans le header Authorization pour les appels API internes.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const headers = new Headers(options.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  } else {
    console.warn('[authFetch] No session token — request will be unauthenticated:', url)
    return new Response(JSON.stringify({ error: 'Session expirée. Veuillez vous reconnecter.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return fetch(url, { ...options, headers })
}
