# LEADS and OPPORTUNITIES

ARTISTS' light CRM, shipped in 1.25.0 (2026-10-05). The roster is who the
practice works with; a **lead** is somebody it is getting to know, and an
**opportunity** is concrete work that came of a lead. This document is the
engineering record: the model, the rules, the surfaces and why they are shaped
the way they are. The operator's manual is the CATECHISM's LEADS chapter
(`src/renderer/src/features/catechism/content/docs/leads.md`).

## Decisions the user approved

These were settled with the user before the build and should not be
re-litigated without them:

- **Temperature is automatic, with a manual pin.** It follows the interactions
  until set by hand, and holds until **Back to automatic**.
- **Stages** are Open, In talks, Negotiating, Agreed, In progress, then Won or
  Lost, plus Archive. Stage is separate from temperature: one describes the
  work, the other the relationship.
- **Snooze** offers an hour, this evening at 18:00 (tomorrow's if that has
  passed), and tomorrow at 10:00.
- **The first task** ("First interaction", high priority) is made with every
  lead, due now unless a time is picked, and does not notify at creation.
- **Value** is an optional amount and currency (CAD by default), with notes.
- **Data is local only**, per PC, like the rest of the archive. Nothing goes to
  the website.
- **Interactions are typed, not picked:** a text field, a points field, Enter.
  Predefined suggestions live in REGULATION, each with its own points.

## The model

`src/shared/domain/leads.ts` (zod) and `leads.constants.ts` (zod-free, so the
strip and the renderer read the rules without the schemas).

| Record          | Holds                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Lead**        | name, notes, links (the roster's `ArtistLinkSchema`), email, phone, `artistId`, `pinnedTemperature`, interactions, tasks, `archivedAt` |
| **Interaction** | `at`, `text` (1..200), `points` (−50..+50)                                                                                             |
| **Task**        | title, `dueAt`, priority (`low` / `normal` / `high`), notes, `completedAt`, `snoozedUntil`, `dismissedAt`, `createdAt`                 |
| **Opportunity** | `leadId`, title, kind, stage, `amount`, currency, notes, tasks, `closedAt`, `archivedAt`                                               |

**Tasks live inside their parent** (a lead's or an opportunity's array) rather
than in a collection of their own. A relationship is read whole, a handful of
leads at a time, and nothing else in the archive needs a task on its own. A task
is addressed by `TaskRef { parentKind, parentId, taskId }`.

An opportunity points at its lead (`leadId`) rather than copying the contacts,
so there is one place each lives. Removing a lead removes its opportunities.

**Status is worked out, never stored** (`taskStatus`): `complete` once
`completedAt` is set, else `overdue` when `dueAt <= now`, else `pending`.

Collections (`src/main/services/archive/schema.ts`): `artists_leads` and
`artists_opportunities`, one document per record keyed by its id. No indexes;
the whole register is tens of records.

## Temperature

`automaticTemperature(createdAt, interactions, coolingPerWeek, now)` replays the
interactions oldest first. Each adds its own points; the quiet time before it
cools the running value by `coolingPerWeek` per week, proportionally to the day;
the value is clamped to 0..100 at every step; the quiet time since the last
interaction cools it again. A new lead starts at 0 (frozen).

Seven named stops (`TEMPERATURE_BANDS`): Frozen 0, Cold 17, Cool 33, Neutral 50,
Warm 67, Hot 83, Supernova 100. A value's band is the nearest stop.

Each interaction keeps the points it was logged with, so changing a predefined
interaction's points in REGULATION counts from then on and never re-scores the
past. `pinnedTemperature` (0..100, rounded) overrides the automatic value while
set; the slider draws a marker where the automatic value would be.

The temperature is computed in the renderer (`readTemperature` in
`features/artists/leads/model.ts`) because it depends on REGULATION's cooling,
which the renderer reads anyway, and on the current time.

The history (`History.tsx`) replays the same rule to draw **Quiet for N weeks**
lines between interactions, with what each quiet spell actually cost (nothing,
from a lead already frozen). They are derived, never stored.

## The service

`src/main/services/leads/leads.service.ts`, wired in `container.ts`. It holds
both registers in memory and mirrors every change to the archive, as CALENDAR
does: hydrate once from a connected archive, write through, publish.

- Every write answers with the whole `LeadsState` and emits `changed`, which
  `register-handlers.ts` broadcasts as `leads:state` to every window, so the
  console and the strip stay in step without asking.
- `setChangeListener` tells CALENDAR to refresh its projection after every
  change.
- A write while the archive is down is refused with a hint; reads answer empty
  with `attached: false`, so the renderer can say "not connected" rather than
  "no leads".
- `updateTask` with a new `dueAt` clears `snoozedUntil` and `dismissedAt`: a new
  time is a new reminder. `logInteraction` can complete a task in the same step
  (`complete: TaskRef`). `updateOpportunity` stamps `closedAt` on Won or Lost and
  clears it when reopened.

IPC (`src/shared/ipc/contract.ts`): `leads:state`, `leads:create`,
`leads:update`, `leads:remove`, `leads:temperature`, `leads:log`, `leads:unlog`,
`leads:task-add`, `leads:task-update`, `leads:task-remove`, `leads:task-snooze`,
`leads:task-dismiss`, `leads:convert`, `opportunities:update`,
`opportunities:remove`, and the event `leads:state`. The renderer side is
`hooks/useLeads.ts`: `useLeads` (pushed state with the usual ordering guard),
`useLeadsActions` (writes, refusals raised in the notice stack), `useLeadsSettings`
and `useNow` (a clock that also reads afresh when the pushed state changes, so a
task made due this moment draws overdue at once).

## Reminders

`src/main/app/follow-ups.ts` (`FollowUpReminders`), started after boot in
`src/main/index.ts` beside CALENDAR's reminders. It looks every 30 seconds.

- **On opening**, everything already overdue is said once, in one notice (or
  the one task by name).
- **Afterwards**, each task gets one notice as it comes due; more than two at
  once (after sleep) are folded into one.
- **Keys** are `taskId|dueAt|snoozedUntil`, so a snooze ending or a moved due
  time reminds again. Dismissed and completed tasks never remind; archived leads
  and opportunities are left out of `openTasks()`.
- **Due on arrival**: a task created already due (within `DUE_ON_ARRIVAL_MS`)
  and not snoozed says nothing in the sitting it was made in. It stays overdue
  everywhere, and the next opening counts it.
- `overdueChanged` fires whenever the set of overdue task ids changes by the
  clock alone, and `index.ts` answers it with `calendar.refresh()`, because
  CALENDAR reads a follow-up's status when it is projected.
- **Clicking** a notice opens the lead (or opportunity) in the console when the
  console is on screen, otherwise the strip's `followup` popup
  (`StripPopupSchema`), which carries the reminder's actions: Log and complete,
  Open, Snooze, Dismiss. Windows notifications can't carry buttons themselves.

Gated by `settings.leads.reminders` (on by default).

## Surfaces

| Where                   | What                                                                                              | Files                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ARTISTS → LEADS         | The list (orbs, Follow-ups due), a lead's sheet, Add a lead                                       | `features/artists/leads/LeadsView.tsx`, `LeadSheet.tsx`, `NewLeadDialog.tsx`                                                                                     |
| ARTISTS → OPPORTUNITIES | The board by stage, an opportunity's sheet, Make an opportunity                                   | `OpportunitiesView.tsx`, `OpportunitySheet.tsx`, `ConvertDialog.tsx`                                                                                             |
| Shared pieces           | The orb and its single animation loop, the slider, steps, logging, history, follow-ups, due field | `orb.ts`, `TemperatureOrb.tsx`, `TemperatureSlider.tsx`, `TemperaturePanel.tsx`, `LogInteraction.tsx`, `History.tsx`, `TaskList.tsx`, `DueField.tsx`, `model.ts` |
| CALENDAR                | Follow-up marks in all four lenses; a day's list                                                  | `features/calendar/followUps.ts`, `components/FollowUpMark.tsx`, `DaySheet.tsx`, `DayList.tsx`                                                                   |
| QUICK STRIP             | Overdue follow-ups lead Today; the Today popup's Follow-ups; the `followup` popup                 | `features/strip/useStrip.ts`, `popups/FollowUps.tsx`, `popups/FollowUpPopup.tsx`                                                                                 |
| NEXUS                   | The follow-ups card under SONOALCHEMY, foldable                                                   | `features/home/components/FollowUpsBeacon.tsx`                                                                                                                   |
| REGULATION → LEADS      | Predefined interactions, cooling per quiet week, Remind me                                        | `features/regulation/components/LeadsPanels.tsx`                                                                                                                 |
| Palette                 | **New Lead**                                                                                      | `features/palette/buildResults.ts`                                                                                                                               |

The lens and any open record live in the address (`/artists?lens=leads&lead=…`,
`?lens=opportunities&opportunity=…`), so reminders, the strip, NEXUS and
CALENDAR all land on a record by route. A route stays under the strip's
80-character page-target limit with a UUID.

### CALENDAR's projection

Follow-ups reach CALENDAR the way release dates do: projected, never copied.
`LeadsService.followUps()` returns `CalendarFollowUp[]` (task id, parent, lead,
title, who, local date, start minute, priority, status), and
`calendar.setFollowUpReader` reads it on every snapshot. A follow-up is drawn
read-only and clicking it navigates to its record. It is not counted as an entry.

### The orb

The orb was approved as an interactive prototype and ported to canvas
(`orb.ts`): frost dendrites, sparkles and snow when cold; corona rays, shock
rings, plasma, embers and a white-hot core when hot. Every mounted orb shares one
`requestAnimationFrame` loop that stops when none is animating, orbs off screen
are not drawn (one shared `IntersectionObserver`), and with motion reduced or
off they draw still frames. A small orb (`compact`) draws fewer particles.

## Settings

`settings.leads` (`LeadsSettingsSchema`):

| Key              | Default                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `interactions`   | They replied +15, They messaged first +18, Candy commented +6, Candy replied to their story +5, Call or video call +25, Met in person +30, They unfollowed −20 (up to 40) |
| `coolingPerWeek` | 10 (0..50; 0 stops cooling)                                                                                                                                               |
| `reminders`      | true                                                                                                                                                                      |
