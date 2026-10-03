import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { asksHowToOpen, type Pin, type StripSettings } from '@shared/domain/strip'
import { selectArchive, useSystemStore } from '@renderer/app/store/system.store'
import { useDispatch } from '@renderer/hooks/useDispatch'
import { Logomark } from '@renderer/components/sigil/Logomark'
import { Icon } from './icons'
import { targetGlyph } from './glyphs'
import {
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

/**
 * THE QUICK STRIP: the logo, today's agenda, the operator's pins, who is
 * signed in, and the gear. Drawn one of three ways (REGULATION, Look).
 *
 * Moved by any empty part of it (the drag region is the strip itself; every
 * control opts out). Files and folders dropped on the pins become pins.
 */
export function StripBar({ scale }: { scale: number }): ReactNode {
  const settings = useStripSettings()
  const today = useToday()
  const ref = useRef<HTMLDivElement>(null)
  const [notice, say] = useNotice()
  const [dropping, setDropping] = useState(false)
  useFit(ref, scale, settings.enabled)

  const open = (pin: Pin): void => {
    const { target } = pin
    if (target.kind === 'action' && target.action === 'new-project') {
      void window.candy.strip.popup({ kind: 'new-project' })
    } else if (target.kind === 'action' && target.action === 'add-to-today') {
      void window.candy.strip.popup({ kind: 'add' })
    } else if (target.kind === 'folder') {
      void window.candy.strip.popup({ kind: 'folder', path: target.path, label: pin.label })
    } else if (asksHowToOpen(target)) {
      // A stack or a project not told how to open: the ways it can, beside the strip.
      void window.candy.strip.popup({ kind: 'choose', pinId: pin.id })
    } else {
      window.candy.strip.openTarget(target).catch((cause: Error) => say(cause.message))
    }
  }

  const options = (pin: Pin): void => {
    void window.candy.strip.popup({ kind: 'pin', pinId: pin.id })
  }

  const drop = async (event: DragEvent<HTMLElement>): Promise<void> => {
    event.preventDefault()
    setDropping(false)
    const added = await pinsFromDrop(event.dataTransfer.files)
    if (!added.length) return
    await savePins([...settings.pins, ...added])
    say(added.length === 1 ? `Pinned ${added[0].label}` : `Pinned ${added.length}`)
  }

  const dropZone = {
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!event.dataTransfer.types.includes('Files')) return
      event.preventDefault()
      setDropping(true)
    },
    onDragLeave: () => setDropping(false),
    onDrop: (event: DragEvent<HTMLElement>) => void drop(event)
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
    <div className={styles.pins} data-dropping={dropping || undefined} {...dropZone}>
      {settings.pins.map((pin) => (
        <button
          key={pin.id}
          type="button"
          className={styles.pin}
          title={pin.label}
          aria-label={pin.label}
          onClick={() => open(pin)}
          onContextMenu={(event) => {
            event.preventDefault()
            options(pin)
          }}
        >
          <Icon glyph={targetGlyph(pin.target)} />
        </button>
      ))}
      {settings.pins.length === 0 ? (
        <span className={styles.empty}>Drop files or folders here</span>
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
  const nextText = today.next
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
            title={nextText}
            onClick={() => void window.candy.strip.popup({ kind: 'today', entryId: null })}
          >
            <Icon glyph="calendar" size={17} />
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
          {today.overdue.length ? (
            <span className={styles.overdueMark}>{today.overdue.length} overdue</span>
          ) : null}
        </span>
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
    </span>
  )
}
