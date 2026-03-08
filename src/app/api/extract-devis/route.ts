// src/app/api/extract-devis/route.ts
// Ajouter ANTHROPIC_API_KEY dans .env.local + Vercel env vars

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { pdfBase64 } = await request.json()
    if (!pdfBase64) return NextResponse.json({ error: 'No PDF' }, { status: 400 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquant' }, { status: 500 })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
            },
            {
              type: 'text',
              text: `Tu es un extracteur de données de devis commerciaux marocains (format Compucom).
Extrais TOUTES les lignes produits/services de ce devis.
Réponds UNIQUEMENT avec du JSON valide, sans texte avant ou après, sans backticks.
Format exact :
{
  "numero_devis": "26/00064/S/N-V2",
  "client": "ACOME",
  "date": "04/03/2026",
  "total_ht": 151037,
  "lines": [
    {
      "ref": "C1300-12XS",
      "designation": "Catalyst 1300 12-port SFP+, 2x10GE Shared",
      "qty": 2,
      "pu_vente": 20325,
      "pt_vente": 40650
    }
  ]
}
Notes:
- Les montants sont en MAD, avec virgule ou point comme séparateur décimal
- Si ref est vide ou absent, utilise ""
- qty, pu_vente, pt_vente sont des nombres (pas des strings)
- Capture TOUTES les lignes, y compris les accessoires sans ref
- Si le devis est multi-pages, capture toutes les pages`,
            },
          ],
        }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: `Claude API error: ${err}` }, { status: 500 })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || '{}'

    // Nettoyer et parser
    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(clean)

    return NextResponse.json(parsed)
  } catch (err: any) {
    console.error('extract-devis error:', err)
    return NextResponse.json({ error: err?.message || 'Erreur extraction' }, { status: 500 })
  }
}
