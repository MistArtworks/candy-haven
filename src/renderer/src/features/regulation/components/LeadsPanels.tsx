import { useState, type FormEvent, type ReactNode } from 'react'
import type { Settings } from '@shared/domain/settings'
import type { LeadsSettings, PredefinedInteraction } from '@shared/domain/leads'
import {
  DEFAULT_COOLING_PER_WEEK,
  DEFAULT_INTERACTIONS,
  MAX_INTERACTION_POINTS
} from '@shared/domain/leads.constants'
import type { ApplySettings } from '@renderer/hooks/useSettings'
import { Panel } from '@renderer/components/primitives/Panel'
import { Toggle } from '@renderer/components/primitives/Toggle'
import { Button } from '@renderer/components/primitives/Button'
import { signOf } from '@renderer/features/leads/model'
import styles from '../RegulationPage.module.scss'
import own from './LeadsPanels.module.scss'

/** As many as the schema keeps. */
const MAX_PREDEFINED = 40

const DEFAULTS: LeadsSettings = {
  interactions: DEFAULT_INTERACTIONS.map((entry) => ({ ...entry })),
  coolingPerWeek: DEFAULT_COOLING_PER_WEEK,
  reminders: true
}

/**
 * LEADS: ARTISTS' follow-ups. The interactions offered when logging, each
 * with its points; how fast a quiet lead cools; and whether follow-ups remind.
 *
 * The list works as the approved prototype's does: a name and its points,
 * Enter to add; rename or re-point in place; × to remove. A logged
 * interaction keeps the points it was logged with, so a change here counts
 * from now on and never re-scores the past.
 */
export function LeadsPanels({
  settings,
  apply
}: {
  settings: Settings | null
  apply: ApplySettings
}): ReactNode {
  const leads = settings?.leads ?? DEFAULTS
  const set = (patch: Partial<LeadsSettings>): void => apply({ leads: patch })
  const setInteractions = (interactions: PredefinedInteraction[]): void => set({ interactions })

  return (
    <>
      <Panel label="Predefined interactions" index="01" aside={<span>Used when logging</span>}>
        <div className={styles.controls}>
          <p className={styles.controlHint}>
            The suggestions offered when logging an interaction, each with its points. Picking one
            fills in both; typing one&apos;s name in full brings its points too. A logged
            interaction keeps the points it was logged with, so a change here counts from now on.
          </p>

          {leads.interactions.length > 0 ? (
            <ul className={own.list}>
              {leads.interactions.map((entry) => (
                <InteractionRow
                  key={entry.id}
                  entry={entry}
                  onChange={(next) =>
                    setInteractions(
                      leads.interactions.map((item) => (item.id === entry.id ? next : item))
                    )
                  }
                  onRemove={() =>
                    setInteractions(leads.interactions.filter((item) => item.id !== entry.id))
                  }
                />
              ))}
            </ul>
          ) : (
            <p className={styles.controlHint}>None. Logging still works: type what happened.</p>
          )}

          {leads.interactions.length < MAX_PREDEFINED ? (
            <AddRow
              onAdd={(entry) => setInteractions([...leads.interactions, entry])}
              taken={leads.interactions.map((item) => item.name.toLowerCase())}
            />
          ) : (
            <p className={styles.controlHint}>That is the most there can be: {MAX_PREDEFINED}.</p>
          )}

          <div className={own.foot}>
            <div className={own.cooling}>
              <span className={styles.controlLabel}>Cooling per quiet week</span>
              <NumberField
                value={leads.coolingPerWeek}
                min={0}
                max={50}
                sign="minus"
                ariaLabel="Points lost per quiet week"
                onChange={(coolingPerWeek) => set({ coolingPerWeek })}
              />
              <p className={styles.controlHint}>
                Points a lead loses for each week nothing is logged, worked out to the day. 0 stops
                cooling altogether.
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                set({
                  interactions: DEFAULTS.interactions.map((entry) => ({ ...entry })),
                  coolingPerWeek: DEFAULT_COOLING_PER_WEEK
                })
              }
            >
              Back to the defaults
            </Button>
          </div>
        </div>
      </Panel>

      <Panel label="Follow-up reminders" index="02">
        <div className={styles.controls}>
          <div className={styles.control}>
            <span className={styles.controlLabel}>Remind me</span>
            <Toggle
              label="Remind me of follow-ups"
              checked={leads.reminders}
              onChange={() => set({ reminders: !leads.reminders })}
            />
            <p className={styles.controlHint}>
              A Windows notification when a follow-up comes due, and one on opening Candy Haven for
              whatever is already overdue. Clicked, it opens on the QUICK STRIP with Log and
              complete, Snooze and Dismiss. Overdue follow-ups show on the strip, in NEXUS and in
              ARTISTS either way.
            </p>
          </div>
        </div>
      </Panel>
    </>
  )
}

/** One predefined interaction: renamed in place, points typed, × to remove. */
function InteractionRow({
  entry,
  onChange,
  onRemove
}: {
  entry: PredefinedInteraction
  onChange: (next: PredefinedInteraction) => void
  onRemove: () => void
}): ReactNode {
  // Held while typed: an emptied name isn't one, so the last good name stays.
  const [name, setName] = useState<string | null>(null)

  return (
    <li className={own.row}>
      <input
        className={own.name}
        value={name ?? entry.name}
        maxLength={60}
        aria-label="Interaction"
        onChange={(event) => {
          const next = event.target.value
          if (next.trim()) {
            setName(null)
            onChange({ ...entry, name: next })
          } else {
            setName(next)
          }
        }}
        onBlur={() => setName(null)}
      />
      <NumberField
        value={entry.points}
        min={-MAX_INTERACTION_POINTS}
        max={MAX_INTERACTION_POINTS}
        ariaLabel={`Points for ${entry.name}`}
        onChange={(points) => onChange({ ...entry, points })}
      />
      <button
        type="button"
        className={own.remove}
        aria-label={`Remove ${entry.name}`}
        onClick={onRemove}
      >
        ×
      </button>
    </li>
  )
}

/** A name and its points, Enter: one more suggestion. */
function AddRow({
  onAdd,
  taken
}: {
  onAdd: (entry: PredefinedInteraction) => void
  taken: readonly string[]
}): ReactNode {
  const [name, setName] = useState('')
  const [points, setPoints] = useState('5')
  const value = Number(points)
  const duplicate = taken.includes(name.trim().toLowerCase())
  const valid =
    name.trim().length > 0 &&
    !duplicate &&
    points.trim() !== '' &&
    Number.isInteger(value) &&
    Math.abs(value) <= MAX_INTERACTION_POINTS

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (!valid) return
    onAdd({ id: `custom-${Date.now()}`, name: name.trim(), points: value })
    setName('')
    setPoints('5')
  }

  return (
    <form className={own.row} autoComplete="off" onSubmit={submit}>
      <input
        className={own.name}
        value={name}
        maxLength={60}
        placeholder="Add one: Shared their track"
        aria-label="New interaction"
        onChange={(event) => setName(event.target.value)}
      />
      <input
        className={own.points}
        type="number"
        min={-MAX_INTERACTION_POINTS}
        max={MAX_INTERACTION_POINTS}
        value={points}
        aria-label="Its points"
        data-sign={signOf(Number(points) || 0)}
        onChange={(event) => setPoints(event.target.value)}
      />
      <button type="submit" className={own.add} disabled={!valid}>
        Add
      </button>
      {duplicate ? <p className={own.problem}>That one is already on the list.</p> : null}
    </form>
  )
}

/** A whole number in range, typed; out of range or half-typed, it waits. */
function NumberField({
  value,
  min,
  max,
  ariaLabel,
  sign,
  onChange
}: {
  value: number
  min: number
  max: number
  ariaLabel: string
  /** Tinted as this sign whatever the value: cooling only ever cools. */
  sign?: 'plus' | 'minus'
  onChange: (value: number) => void
}): ReactNode {
  const [typing, setTyping] = useState<string | null>(null)
  return (
    <input
      className={own.points}
      type="number"
      min={min}
      max={max}
      step={1}
      value={typing ?? String(value)}
      aria-label={ariaLabel}
      data-sign={sign ?? signOf(value)}
      onChange={(event) => {
        const text = event.target.value
        const next = Number(text)
        if (text.trim() !== '' && Number.isInteger(next) && next >= min && next <= max) {
          setTyping(null)
          onChange(next)
        } else {
          setTyping(text)
        }
      }}
      onBlur={() => setTyping(null)}
    />
  )
}
