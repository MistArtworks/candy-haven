import type { ReactNode } from 'react'
import { MenuDivider, MenuItem, MenuLabel, MenuSurface } from '../menu/MenuSurface'

export interface FinalMasterMenuProps {
  /** The shipped file's name, for the heading. */
  name: string
  x: number
  y: number
  /** False when nothing else in the project is marked a mix or a master. */
  canSwap: boolean
  /** True when the project's stage would fall back on unlinking. */
  stepsBack: boolean
  onPlay: () => void
  onReveal: () => void
  onSwap: () => void
  onUnlink: () => void
  onClose: () => void
}

/**
 * Right-click on the final mix and master.
 *
 * The one file in the dossier that cannot be changed by clicking anything —
 * shipping it is a side effect of reaching TRACK READY, and re-entering that
 * stage deliberately passes straight through rather than re-asking. So a mix
 * that changed after the fact had nowhere to land, and this is where it lands.
 *
 * A menu rather than buttons in the row. Swapping and unlinking both *move a
 * file on disk*, which is not something to put a click away from a row whose
 * ordinary gestures are "show me" and "play me"; and the row is one line tall,
 * with no space for two controls that would each need a word of explanation.
 *
 * The first two entries are the gestures the row already has, named. They earn
 * their place by making the menu self-describing: an operator who opens it to
 * find out what is possible should not have to already know that double-click
 * plays.
 */
export function FinalMasterMenu({
  name,
  x,
  y,
  canSwap,
  stepsBack,
  onPlay,
  onReveal,
  onSwap,
  onUnlink,
  onClose
}: FinalMasterMenuProps): ReactNode {
  const run = (action: () => void) => (): void => {
    action()
    onClose()
  }

  return (
    <MenuSurface x={x} y={y} onClose={onClose}>
      <MenuLabel>{name}</MenuLabel>

      <MenuItem label="Play in the listening room" onClick={run(onPlay)} />
      <MenuItem label="Show in Explorer" onClick={run(onReveal)} />

      <MenuDivider />

      {/*
        Disabled rather than hidden, and the label carries the reason. A menu
        that is one item shorter than last time tells the operator nothing;
        "no other mixes or masters marked" tells them exactly what to go and do.
      */}
      <MenuItem
        label={canSwap ? 'Swap for another bounce…' : 'No other mixes or masters marked'}
        disabled={!canSwap}
        onClick={run(onSwap)}
      />

      {/*
        Not danger-styled. Nothing is destroyed — the file moves back into the
        project folder and is marked a master on the way in, ready to ship
        again. Crimson is for the two removals in the project menu, and spending
        it here would put unlinking in their company.
      */}
      <MenuItem
        label={stepsBack ? 'Unlink — back to MASTER' : 'Unlink — return it to the project'}
        onClick={run(onUnlink)}
      />
    </MenuSurface>
  )
}
