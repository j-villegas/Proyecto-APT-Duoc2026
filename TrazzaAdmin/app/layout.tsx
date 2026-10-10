import type { Metadata } from 'next'
import { JetBrains_Mono, Manrope } from 'next/font/google'
import './globals.css'

// Manrope: geométrica y con carácter, buena para cifras. JetBrains Mono para
// patentes y códigos (servicios, rutas), que deben leerse carácter a carácter.
const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
})

const mono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['500', '700'],
})

export const metadata: Metadata = {
  title: 'TRAZZA | Panel operacional',
  description: 'Panel Administrativo Operacional',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={`${manrope.variable} ${mono.variable} h-full`}>
      <body className="h-full font-sans antialiased">{children}</body>
    </html>
  )
}
