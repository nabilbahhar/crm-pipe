import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Middleware Next.js — Headers de sécurité uniquement.
 * L'authentification est gérée :
 *   - Côté client : ClientLayout vérifie la session Supabase (localStorage)
 *   - Côté API : requireAuth() vérifie le Bearer token
 *
 * Note: Supabase JS SDK stocke la session dans localStorage (pas les cookies),
 * donc le middleware ne peut pas vérifier l'auth côté serveur sans @supabase/ssr.
 */
export async function middleware(req: NextRequest) {
  return addSecurityHeaders(NextResponse.next())
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  // Empêcher l'encadrement dans des iframes (clickjacking)
  response.headers.set('X-Frame-Options', 'DENY')
  // Empêcher le sniffing MIME
  response.headers.set('X-Content-Type-Options', 'nosniff')
  // Protection XSS (pour navigateurs anciens)
  response.headers.set('X-XSS-Protection', '1; mode=block')
  // Politique de referrer
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  // Permissions Policy (désactiver caméra, micro, géolocalisation)
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  // Content-Security-Policy
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://cnrpaedvqjvepwtypbmw.supabase.co",
      "font-src 'self' data:",
      "connect-src 'self' https://cnrpaedvqjvepwtypbmw.supabase.co wss://cnrpaedvqjvepwtypbmw.supabase.co https://api.anthropic.com",
      "frame-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ')
  )

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
