'use client'

import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  href: string
  className?: string
  children: ReactNode
}

/**
 * Fila de tabla que navega a `href` al hacer clic en cualquier parte.
 * Los enlaces y botones dentro de la fila siguen funcionando por sí solos
 * (incluido Ctrl/Cmd + clic para abrir en otra pestaña).
 */
export default function ClickableRow({ href, className, children }: Props) {
  const router = useRouter()

  function handleClick(e: MouseEvent<HTMLTableRowElement>) {
    if ((e.target as HTMLElement).closest('a, button')) return
    if (window.getSelection()?.toString()) return
    if (e.ctrlKey || e.metaKey) {
      window.open(href, '_blank')
      return
    }
    router.push(href)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === 'Enter' && e.target === e.currentTarget) router.push(href)
  }

  return (
    <tr
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      className={`cursor-pointer focus:outline-none focus-visible:bg-sunken ${className ?? ''}`}
    >
      {children}
    </tr>
  )
}
