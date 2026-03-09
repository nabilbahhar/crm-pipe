import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Routes accessibles sans authentification
const PUBLIC_ROUTES = ['/login', '/reset-password']

// Routes API (protégées par requireAuth dans chaque handler)
const API_PREFIX = '/api/'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Laisser passer les fichiers statiques et API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.') ||
    pathname.startsWith(API_PREFIX)
  ) {
    return addSecurityHeaders(NextResponse.next())
  }

  // Routes publiques
  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) {
    return addSecurityHeaders(NextResponse.next())
  }

  // Vérifier le token Supabase dans les cookies
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnon) {
    return addSecurityHeaders(NextResponse.next())
  }

  // Extraire le token de session depuis les cookies Supabase
  const allCookies = req.cookies.getAll()
  const sbAccessToken = allCookies.find(c =>
    c.name.includes('sb-') && c.name.includes('-auth-token')
  )

  // Vérifier aussi le format de cookie plus récent
  const sbSession = allCookies.find(c =>
    c.name.startsWith('sb-') && c.name.endsWith('-auth-token.0')
  )

  if (!sbAccessToken && !sbSession) {
    // Pas de session -> rediriger vers login
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    return addSecurityHeaders(NextResponse.redirect(loginUrl))
  }

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
