import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'

// ─── Security: Whitelist models & cap tokens ───────────────────
const ALLOWED_MODELS = ['claude-sonnet-4-20250514', 'claude-haiku-4-20250414']
const MAX_TOKENS_LIMIT = 8192
const MAX_BODY_SIZE = 500_000 // ~500KB max request body

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 })
    }

    // Validate body size
    const contentLength = Number(req.headers.get('content-length') || 0)
    if (contentLength > MAX_BODY_SIZE) {
      return NextResponse.json({ error: 'Requête trop volumineuse' }, { status: 413 })
    }

    const body = await req.json()

    // Validate & sanitize: only forward safe fields
    const model = ALLOWED_MODELS.includes(body.model) ? body.model : ALLOWED_MODELS[0]
    const maxTokens = Math.min(Math.max(Number(body.max_tokens) || 4096, 256), MAX_TOKENS_LIMIT)

    // Only allow messages and system prompt — no tools, no raw passthrough
    const messages = Array.isArray(body.messages) ? body.messages : []
    const systemPrompt = typeof body.system === 'string' ? body.system : undefined

    const safeBody: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages,
    }
    if (systemPrompt) safeBody.system = systemPrompt

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(safeBody),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('[chat] Anthropic error:', data?.error?.message)
      return NextResponse.json({ error: 'Erreur du service IA' }, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (err: any) {
    console.error('[chat] Route error:', err)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}
