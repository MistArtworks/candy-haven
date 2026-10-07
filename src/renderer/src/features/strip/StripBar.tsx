import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import {
  GROUP_SIZE,
  insertPins,
  isGroup,
  type GroupPin,
  type StripPin,
  type StripSettings
} from '@shared/domain/strip'
import { selectArchive, useSystemStore } from '@renderer/app/store/system.store'
import { useDispatch } from '@renderer/hooks/useDispatch'
import { Logomark } from '@renderer/components/sigil/Logomark'
import { Icon } from './icons'
import { PinFace } from './PinFace'
import { openPin } from './openPin'
import { useSiteIcons } from './siteIcon'
import {
  anchorOf,
  carriesPins,
  clock,
  pinsFromDrop,
  savePins,
  saveStrip,
  useFit,
  useNotice,
  useStripSettings,
  useToday,
  type Today
} from './useStrip'
import styles from './Strip.module.scss'

/** Resting on Recent projects this long drops its sets down, as Live's menu does. */
const REST_MS = 300

/** Recent projects: dropped down by the pointer resting on it, as well as by a press. */
const dropsOnRest = (pin: StripPin): boolean =>
  !isGroup(pin) && pin.target.kind === 'action' && pin.target.action === 'recent-projects'

/**
 * THE QUICK STRIP: the logo, today's agenda, the operator's pins, who is
 * signed in, and the gear. Drawn one of three ways (REGULATION, Look).
 *
 * Moved by any empty part of it (the drag region is the strip itself; every
 * control opts out). Files, folders and links dropped on the pins become
 * pins; dropped on a group's icon, they go into the group.
 */
export function StripBar({ scale }: { scale: number }): ReactNode {
  const settings = useStripSettings()
  const today = useToday()
  const ref = useRef<HTMLDivElement>(null)
  const [notice, say] = useNotice()
  /** What a drag is over: the pins (null), or a group's icon (its id). */
  const [dropping, setDropping] = useState<{ group: string | null } | null>(null)
  const resting = useRef<number | null>(null)
  useFit(ref, scale, settings.enabled)
  useSiteIcons(settings.pins, settings.enabled)

  const stopResting = (): void => {
    if (resting.current !== null) window.clearTimeout(resting.current)
    resting.current = null
  }
  useEffect(() => {
    const pending = resting
    return () => {
      if (pending.current !== null) window.clearTimeout(pending.current)
    }
  }, [])

  /** The pointer arriving on Recent projects: its sets drop down if it stays. */
  const restOn = (element: HTMLElement): void => {
    stopResting()
    resting.current = window.setTimeout(() => {
      resting.current = null
      void window.candy.strip.popup({
        kind: 'recent',
        anchor: anchorOf(element, scale),
        hover: true
      })
    }, REST_MS)
  }

  const options = (pin: StripPin): void => {
    void window.candy.strip.popup({ kind: 'pin', pinId: pin.id })
  }

  const over = (event: DragEvent<HTMLElement>, group: string | null): void => {
    if (!carriesPins(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    setDropping((was) => (was?.group === group ? was : { group }))
  }

  /** Dropped on the pins, they go at the end; on a group's icon, into the group. */
  const drop = async (event: DragEvent<HTMLElement>, group: GroupPin | null): Promise<void> => {
    event.preventDefault()
    event.stopPropagation()
    setDropping(null)
    const added = await pinsFromDrop(event.dataTransfer)
    if (!added.length) return
    const room = group ? GROUP_SIZE - group.group.items.length : added.length
    if (room <= 0) {
      say(`${group?.label ?? 'That group'} is full`)
      return
    }
    const taken = added.slice(0, room)
    await savePins(
      insertPins(
        settings.pins,
        taken,
        group
          ? { group: group.id, index: group.group.items.length }
          : { group: null, index: settings.pins.length }
      )
    )
    const what = taken.length === 1 ? taken[0].label : `${taken.length}`
    say(group ? `Put ${what} in ${group.label}` : `Pinned ${what}`)
  }

  if (!settings.enabled) return null

  if (settings.collapsed) {
    // Folded: the logo alone, in a thin frame that is the handle to drag it by.
    return (
      <div ref={ref} className={styles.frame}>
        <div className={styles.folded}>
          <LogoToggle collapsed />
        </div>
      </div>
    )
  }

  const pins = (
    <div
      className={styles.pins}
      data-dropping={dropping?.group === null || undefined}
      onDragOver={(event) => over(event, null)}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(null)
      }}
      onDrop={(event) => void drop(event, null)}
    >
      {settings.pins.map((pin) => {
        const group = isGroup(pin) ? pin : null
        const drops = group !== null || dropsOnRest(pin)
        return (
          <button
            key={pin.id}
            type="button"
            className={styles.pin}
            data-group={group ? true : undefined}
            data-dropping={(group && dropping?.group === group.id) || undefined}
            title={group ? `${group.label} · ${group.group.items.length}` : pin.label}
            aria-label={pin.label}
            aria-haspopup={drops ? 'true' : undefined}
            onMouseEnter={dropsOnRest(pin) ? (event) => restOn(event.currentTarget) : undefined}
            onMouseLeave={dropsOnRest(pin) ? stopResting : undefined}
            onClick={(event) => {
              stopResting()
              openPin(pin, say, drops ? anchorOf(event.currentTarget, scale) : null)
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              options(pin)
            }}
            onDragOver={group ? (event) => over(event, group.id) : undefined}
            onDrop={group ? (event) => void drop(event, group) : undefined}
          >
            <PinFace pin={pin} />
          </button>
        )
      })}
      {settings.pins.length === 0 ? (
        <span className={styles.empty}>Drop files, folders or links here</span>
      ) : null}
    </div>
  )

  return (
    <div ref={ref} className={styles.frame}>
      <div className={styles.strip} data-look={settings.look}>
        {settings.look === 'panel' ? (
          <Panel settings={settings} today={today} pins={pins} />
        ) : (
          <Line settings={settings} today={today} pins={pins} />
        )}
      </div>
      {notice ? (
        <p className={styles.notice} role="status" data-look={settings.look}>
          {notice}
        </p>
      ) : null}
    </div>
  )
}

/**
 * The logo, which folds the strip down to itself and opens it again: less on
 * screen, less to look at, one click from all of it.
 */
function LogoToggle({ collapsed = false }: { collapsed?: boolean }): ReactNode {
  return (
    <button
      type="button"
      className={styles.logo}
      title={collapsed ? 'Open the strip' : 'Fold the strip away'}
      aria-label={collapsed ? 'Open the strip' : 'Fold the strip away'}
      aria-expanded={!collapsed}
      onClick={() => {
        void window.candy.strip.closePopup()
        void saveStrip({ collapsed: !collapsed })
      }}
    >
      <Logomark width={26} />
    </button>
  )
}

/** Who is signed in to the board: Candy or Mist, by the account. */
function useWho(): { name: string; state: string; online: boolean } {
  const dispatch = useDispatch()
  const archive = useSystemStore(selectArchive)
  const identity = dispatch.link.identity
  const online = archive.state === 'online' || archive.state === 'degraded'
  return {
    name: identity ? identity.toUpperCase() : 'Not signed in',
    state: online ? 'Archive online' : `Archive ${archive.state}`,
    online
  }
}

function Panel({
  settings,
  today,
  pins
}: {
  settings: StripSettings
  today: Today
  pins: ReactNode
}): ReactNode {
  const who = useWho()
  return (
    <>
      {settings.today ? <TodayRow today={today} /> : null}
      {pins}
      <div className={styles.who}>
        <span className={styles.avatar}>
          <LogoToggle />
          <span className={styles.dot} data-online={who.online || undefined} />
        </span>
        <span className={styles.whoText}>
          <span className={styles.name}>{who.name}</span>
          <span className={styles.state}>{who.state}</span>
        </span>
        <Tools />
      </div>
    </>
  )
}

/** Horizontal or vertical: one line of everything. */
function Line({
  settings,
  today,
  pins
}: {
  settings: StripSettings
  today: Today
  pins: ReactNode
}): ReactNode {
  const who = useWho()
  const vertical = settings.look === 'vertical'
  // An overdue follow-up comes first: it's the one thing here that waits on
  // somebody else hearing back.
  const late = today.lateFollowUps > 0 ? today.followUps[0] : null
  const nextText = late
    ? `Follow up: ${late.who}`
    : today.next
      ? `${today.next.startMinute !== null ? `${clock(today.next.startMinute)} ` : ''}${today.next.title}`
      : today.open
        ? `${today.open} to do`
        : 'Nothing today'
  return (
    <>
      <span className={styles.mark}>
        <LogoToggle />
      </span>
      <span className={styles.lineName} title={who.state}>
        <span className={styles.dot} data-online={who.online || undefined} />
        {vertical ? who.name.slice(0, 5) : who.name}
      </span>
      <span className={styles.rule} />
      {pins}
      {settings.today ? (
        <>
          <span className={styles.rule} />
          <button
            type="button"
            className={styles.todayChip}
            data-late={late ? true : undefined}
            title={nextText}
            onClick={() => void window.candy.strip.popup({ kind: 'today', entryId: null })}
          >
            <Icon glyph={late ? 'person' : 'calendar'} size={17} />
            {vertical ? null : <span className={styles.todayChipText}>{nextText}</span>}
            {today.open ? <span className={styles.count}>{today.open}</span> : null}
          </button>
        </>
      ) : null}
      <span className={styles.rule} />
      <Tools />
    </>
  )
}

function TodayRow({ today }: { today: Today }): ReactNode {
  const later = today.entries.filter((entry) => !entry.done && entry !== today.next).slice(0, 2)
  // Overdue follow-ups lead the row: a priority, in the late colour.
  const late = today.followUps.filter((row) => row.status === 'overdue')
  const overdue = today.overdue.length + late.length
  const extra = [
    ...today.releases.map((release) => `${release.title} is out`),
    ...today.anniversaries.map((one) => `${one.title} turns ${one.years}`)
  ]
  return (
    <button
      type="button"
      className={styles.today}
      onClick={() => void window.candy.strip.popup({ kind: 'today', entryId: null })}
    >
      <span className={styles.todayIcon}>
        <Icon glyph="calendar" size={20} />
      </span>
      <span className={styles.todayText}>
        <span className={styles.todayHead}>
          TODAY
          {today.open ? <span className={styles.count}>{today.open}</span> : null}
          {overdue ? <span className={styles.overdueMark}>{overdue} overdue</span> : null}
        </span>
        {late.length ? (
          <span className={styles.priorityLine}>
            <Icon glyph="person" size={14} />
            <b>Follow up</b>
            {late[0].who}
            {late.length > 1 ? <span className={styles.more}>+{late.length - 1}</span> : null}
          </span>
        ) : null}
        <span className={styles.next}>
          {today.next ? (
            <>
              {today.next.startMinute !== null ? (
                <b className={styles.time}>{clock(today.next.startMinute)}</b>
              ) : null}
              {today.next.title}
            </>
          ) : today.ready ? (
            'Nothing left today'
          ) : (
            'Reading the calendar…'
          )}
        </span>
        {later.length || extra.length ? (
          <span className={styles.then}>
            {[
              ...later.map(
                (entry) =>
                  `${entry.startMinute !== null ? `${clock(entry.startMinute)} ` : ''}${entry.title}`
              ),
              ...extra
            ].join(' · ')}
          </span>
        ) : null}
      </span>
      <Icon glyph="open" size={16} />
    </button>
  )
}

/** The gear (REGULATION, at the strip's own settings) and the strip's menu. */
function Tools(): ReactNode {
  return (
    <span className={styles.tools}>
      <button
        type="button"
        className={styles.tool}
        title="Settings"
        aria-label="Settings"
        onClick={() =>
          void window.candy.strip.openTarget({ kind: 'page', route: '/regulation?section=strip' })
        }
      >
        <Icon glyph="gear" size={18} />
      </button>
      <button
        type="button"
        className={styles.tool}
        title="More"
        aria-label="More"
        onClick={() => void window.candy.strip.popup({ kind: 'menu' })}
      >
        <Icon glyph="more" size={18} />
      </button>
      <QuitButton />
    </span>
  )
}

/** How long a first press on Quit waits for the second. */
const ARMED_MS = 3000

/**
 * Quitting Candy Haven, from the strip itself: always there, in every look,
 * and not a pin, so it can't be moved, renamed or removed.
 *
 * Two presses, because one would be too easy to land by accident on a bar
 * that's always on screen, and quitting takes the archive down with the app.
 * The first arms it (crimson, "Press again to quit"); a second within three
 * seconds quits; otherwise it settles back.
 */
function QuitButton(): ReactNode {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), ARMED_MS)
    return () => clearTimeout(timer)
  }, [armed])

  const label = armed ? 'Press again to quit Candy Haven' : 'Quit Candy Haven'
  return (
    <button
      type="button"
      className={styles.tool}
      data-quit
      data-armed={armed || undefined}
      title={label}
      aria-label={label}
      onClick={() => {
        if (!armed) {
          setArmed(true)
          return
        }
        void window.candy.strip.quit()
      }}
      onBlur={() => setArmed(false)}
    >
      <Icon glyph="power" size={17} />
    </button>
  )
}
