import type { ReactNode } from 'react'
import { isGroup, type StripPin } from '@shared/domain/strip'
import { Icon } from './icons'
import { targetGlyph } from './glyphs'
import styles from './Strip.module.scss'

/**
 * A pin's face: a website's own icon once it has one, else the glyph for
 * what it opens; a group's, the icon chosen for it.
 */
export function PinFace({ pin, size = 19 }: { pin: StripPin; size?: number }): ReactNode {
  if (isGroup(pin)) return <Icon glyph={pin.group.icon} size={size} />
  if (pin.target.kind === 'link' && pin.icon) {
    return (
      <img
        className={styles.siteIcon}
        src={pin.icon}
        width={size}
        height={size}
        alt=""
        draggable={false}
      />
    )
  }
  return <Icon glyph={targetGlyph(pin.target)} size={size} />
}
