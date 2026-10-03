import { useEffect, type ReactNode } from 'react'
import { useThemePreferences } from '@renderer/hooks/useMotionPreference'
import { documentRole, documentScale } from './useStrip'
import { StripBar } from './StripBar'
import { StripPopupHost } from './StripPopupHost'

/**
 * The strip's document, in either of its roles. The window is transparent,
 * so the page is too: only what the strip draws is on screen.
 */
export function StripApp(): ReactNode {
  const scale = documentScale()
  useThemePreferences(scale)

  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [])

  return documentRole() === 'popup' ? <StripPopupHost scale={scale} /> : <StripBar scale={scale} />
}
