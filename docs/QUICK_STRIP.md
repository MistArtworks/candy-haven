# THE QUICK STRIP

A small window above every other application, from the moment the PC starts,
holding today, the operator's pins, who is signed in, the settings gear and
Quit. Shipped in 1.23.0 (2026-10-03), with groups, Open a website and site icons
in 1.24.0 (2026-10-04), and follow-ups and the Quit button in 1.25.0
(2026-10-05). The operator's manual is the CATECHISM's QUICK STRIP chapter
(`src/renderer/src/features/catechism/content/docs/strip.md`).

## Why it exists

Most of what the console is opened for is one action: open the set, open the
stems folder, check what is next, file something for later. The strip makes
those one click without loading the console at all, and stays out of the way
while the console is on screen. The user rejected a fixed set of actions as
"very limited and hard coded": pins are the operator's own, any number, any
order.

## The window model

`src/main/app/strip.ts` (`StripManager`).

- **Two windows, its own document.** The strip and one popup, both
  `renderer/strip.html` (with `?role=strip` or `?role=popup`), so neither loads
  the console. Frameless and transparent; the strip is always on top while
  `settings.strip.onTop`.
- **Sized by its content.** The renderer measures itself and asks for that size
  (`strip:fit`, `useFit`); the strip grows from whichever corner it is nearest,
  so a strip in the bottom right grows up and to the left and never off screen.
- **Placement.** Bottom right of the primary screen by default; dragged anywhere
  by any empty part, snapping to an edge it is dropped near, remembered in
  `settings.strip.position`. A position on a screen that is no longer connected
  falls back to the bottom right.
- **The popup** is made once and kept hidden, so opening it costs a message,
  not a page load (`strip:popup` with a `StripPopupSchema` value). It measures
  itself the same way and goes where there is room: above or below the strip,
  else beside it. A group's dropdown anchors to the group's icon (`anchor`).
  Esc, or a click elsewhere, closes it.
- **Standing aside.** While the console is on screen the strip and its popup
  hide (`standAside`, driven by `windows.onPresence`); when the console closes,
  retires to the tray or minimises, the strip comes back as it was.
- **At launch** (`settings.system.launchWith`): `strip` (the default),
  `vestibule` or `console`. The strip itself opens at every launch while
  `settings.strip.enabled`, the sign-in launch included.

## Pins

`src/shared/domain/strip.ts`.

A pin is `{ id, label, target, icon? }`. Targets: `page` (a department route,
80 characters at most), `action` (`new-project`, `recent-projects`,
`add-to-today`, `open-link`, `console`, `vestibule`), `file`, `folder` (listed
beside the strip), `link`,
`stack` (an ARCHIVE folder) and `project`. A stack or a project pin carries
`opensIn` (`archive`, `explorer`, `ableton`) once told; without one, a click
opens the **choose** popup ("Always do this for this pin" saves the answer).

**Groups** (`GroupPinSchema`) are a pin kind holding up to 48 pins, one level
deep: `StripPinSchema` is the union of the two. Helpers in `strip.ts`
(`findPin`, `movePinTo`, `insertPins`, `groupAround`, `ungroup`, `takeOutOfGroup`,
`relocatePins`) keep every edit a pure function of the pin list, written back
through `settings.update({ strip: { pins } })`. At most 200 pins.

**Site icons.** `src/main/app/site.ts` fetches a pinned website's page with
Node's own fetch (so none of the console's cookies go with it), reads the icons
its head declares, best first, and its name. The strip draws the icon into a
48px PNG kept on the pin (`renderer/features/strip/siteIcon.ts`), and renames a
pin still named after its host to the site's own name.

**Paths follow the files.** When the ARCHIVE moves project files (a rename, a
filing, a folder move), `stacks.setPathsListener` in `container.ts` rewrites the
pins pointing into them (`relocatePins`), as it does CALENDAR attachments and
DISCOGRAPHY masters.

## Popups

`StripPopupSchema` kinds, each a component under
`renderer/src/features/strip/popups/`:

| Kind          | Shows                                                                       |
| ------------- | --------------------------------------------------------------------------- |
| `today`       | Follow-ups, overdue entries, today's entries, releases; one opened in place |
| `new-project` | The vestibule's new-project form                                            |
| `add`         | Quick add of a CALENDAR entry, with dropped attachments                     |
| `folder`      | A pinned folder's contents, stepped into and back                           |
| `pin`         | A pin's or a group's options                                                |
| `choose`      | The ways a stack or project opens                                           |
| `group`       | A group's pins, dropped down from its icon                                  |
| `website`     | Open a website, or pin it                                                   |
| `menu`        | More: a website, the console, the vestibule, settings, Hide, Quit           |
| `followup`    | One follow-up from LEADS, with Log and complete, Open, Snooze and Dismiss   |
| `recent`      | The last twenty sets opened, dropped down from the Recent projects pin      |

**Recent projects** (1.27.0) is the one popup the pointer opens as well as a
press. Resting 300 ms on its pin asks for `{ kind: 'recent', anchor, hover: true }`.
Main shows that popup with `showInactive()`, so Live keeps the keyboard, and
watches the pointer (`watchHover`, `screen.getCursorScreenPoint()` every 100 ms):
it stays while the pointer is on the pin, the popup or the way between them, and
closes 450 ms after it leaves them. A hover never takes over a popup that's up;
a press on one the pointer opened focuses it and ends the watch, and then it
closes as the others do. The list itself is ARCHIVE's (`RecentService`, see
`PROJECT_CONTEXT.md`). A strip from before 1.27.0 is given the pin once at
launch (`offerRecentPin`, `strip.recentOffered`).

## Today

`useToday` (`renderer/src/features/strip/useStrip.ts`) reads CALENDAR
(`useCalendar`) and LEADS (`useLeads`): today's entries, overdue entries from the
last month, releases and anniversaries, the next thing, and **follow-ups due by
tonight, overdue first**. Overdue follow-ups are the strip's priorities: they
lead the Panel's Today row in crimson ("FOLLOW UP" and who), turn the one-line
looks' today chip crimson with a person mark, and come first in the Today popup.

## Reminders

Two kinds, both Windows notifications from the main process:

- **CALENDAR entries** (`src/main/app/reminders.ts`): `settings.strip.reminderMinutes`
  before a timed entry starts (10 by default, 0 for none). Clicked, the entry
  opens in the `today` popup, or CALENDAR when the console is on screen.
- **Follow-ups** (`src/main/app/follow-ups.ts`): see `docs/LEADS.md`. Clicked,
  the `followup` popup, or the lead in the console.

Both open the strip first if it is switched off (`onStrip` in `index.ts`).

## Quit

A fixed power button at the end of the strip's tools in every look
(`QuitButton` in `StripBar.tsx`). It is not a pin, so it can't be moved, renamed
or removed: the user asked for it to be a permanent part of the strip. The
first press arms it (crimson, "Press again to quit Candy Haven") for three
seconds; a second press within that time sends `strip:quit`, which is
`app.quit()`, so the archive, the overlay server and the strip all shut down
cleanly. Two presses, because the strip is always on screen and quitting takes
the archive down with it. The More menu's and the tray's Quit stay one press.

## Settings

`settings.strip` (`StripSettingsSchema`): `enabled`, `look` (`panel`,
`horizontal`, `vertical`), `onTop`, `today`, `reminderMinutes`, `collapsed`,
`position`, `pins`. REGULATION's QUICK STRIP category
(`renderer/src/features/regulation/components/StripPanels.tsx`) edits all of
them, with the pin list (groups indented, drag to reorder or regroup, Add to,
Stack… and Project… pickers, File…, Folder…, actions, departments, Pin website,
New group). The strip follows every change through `settings:changed`.

## IPC

`strip:open-target`, `strip:popup`, `strip:close-popup`, `strip:fit`,
`strip:list-folder`, `strip:inspect`, `strip:pick`, `strip:site`, `strip:hide`,
`strip:quit`, and the event `strip:popup`. Handlers in
`src/main/ipc/register-handlers.ts`; targets are opened by
`src/main/app/targets.ts`, which checks a page route against the navigation
registry before opening the console there.
