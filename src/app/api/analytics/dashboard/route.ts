import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    { error: 'Disabled: dashboard uses client-side Supabase fetch (no auth-helpers).' },
    { status: 410 }
  )
}
