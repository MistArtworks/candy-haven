import { asksHowToOpen, isGroup, type StripAnchor, type StripPin } from '@shared/domain/strip'

/**
 * What a click on a pin does, on the strip or in a group's popup.
 *
 * A group drops its pins down from its icon (`anchor`). New project, Add to
 * today, Open a website and a folder open in the popup beside the strip; a
 * stack or a project not told how to open asks; anything else opens, in one
 * place (main/app/targets.ts), and says why when it can't.
 */
export function openPin(
  pin: StripPin,
  say: (message: string) => void,
  anchor: StripAnchor | null = null
): void {
  if (isGroup(pin)) {
    void window.candy.strip.popup({ kind: 'group', pinId: pin.id, anchor })
    return
  }
  const { target } = pin
  if (target.kind === 'action' && target.action === 'new-project') {
    void window.candy.strip.popup({ kind: 'new-project' })
  } else if (target.kind === 'action' && target.action === 'add-to-today') {
    void window.candy.strip.popup({ kind: 'add' })
  } else if (target.kind === 'action' && target.action === 'open-link') {
    void window.candy.strip.popup({ kind: 'website' })
  } else if (target.kind === 'folder') {
    void window.candy.strip.popup({ kind: 'folder', path: target.path, label: pin.label })
  } else if (asksHowToOpen(target)) {
    // A stack or a project not told how to open: the ways it can, beside the strip.
    void window.candy.strip.popup({ kind: 'choose', pinId: pin.id })
  } else {
    window.candy.strip.openTarget(target).catch((cause: Error) => say(cause.message))
  }
}
