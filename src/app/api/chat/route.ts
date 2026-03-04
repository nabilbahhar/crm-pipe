import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const allKeys = Object.keys(process.env).filter(k => k.includes('ANTHRO'))
    const apiKey = process.env.ANTHROPIC_API_KEY

    if (!apiKey) {
      return NextResponse.json({
        error: `ANTHROPIC_API_KEY manquante. Clés trouvées: ${allKeys.join(', ') || 'aucune'}`
      }, { status: 500 })
    }

    const body = await req.json()
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()
    if (!response.ok) return NextResponse.json({ error: data?.error?.message }, { status: response.status })
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

//v1
