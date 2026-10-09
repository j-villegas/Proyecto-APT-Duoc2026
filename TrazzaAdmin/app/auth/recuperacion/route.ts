import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const tokenHash = request.nextUrl.searchParams.get('token_hash')
  const type = request.nextUrl.searchParams.get('type')
  const supabase = await createClient()
  // Fixed destinations prevent open redirects. Supabase validates one-use credentials.
  if (!request.nextUrl.searchParams.has('error')) {
    if (tokenHash && type === 'recovery') {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
      if (!error) return NextResponse.redirect(new URL('/restablecer-contrasena', request.url))
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) return NextResponse.redirect(new URL('/restablecer-contrasena', request.url))
    }
  }
  return NextResponse.redirect(new URL('/restablecer-contrasena?error=enlace', request.url))
}
