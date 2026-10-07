# CALENDAR

The dated register: sessions, deliveries and observances. Four lenses over one
array of entries, plus what other departments put on it: the release dates the
DISCOGRAPHY keeps, and the follow-ups from LEADS.

![calendar-01-month.png](calendar-01-month.png)

## The lenses

| Lens       | Shows                                     | One step of the period control |
| ---------- | ----------------------------------------- | ------------------------------ |
| **MONTH**  | Six weeks at once — where the work falls  | One month                      |
| **WEEK**   | Seven days against the clock              | One week                       |
| **DAY**    | One day, hour by hour                     | One day                        |
| **AGENDA** | The register as a list, from here forward | One month                      |

The lens lives in the URL; the anchor date is local state. That split is
deliberate — a link can point at the agenda, but paging through March does not
leave seven entries in your history to walk back out of.

The arrows step the period; **TODAY** comes back to now. The count beside the
period's name says how many entries are filed in it, and the header says how
many are filed in all.

MONTH and AGENDA answer different questions. MONTH is _where does the work
fall_ — shape, clustering, the empty week you did not notice. AGENDA is _what is
next_, in order, with no gaps to read past.

![calendar-02-agenda.png](calendar-02-agenda.png)

## A day's list

Click a day in MONTH and its list opens first: everything on that day, in
order, with **Add an entry** at the foot. Most clicks on a day are to look, not
to file, so nothing is filed until you ask.

![calendar-05-day-list.png](calendar-05-day-list.png)

The list runs releases and anniversaries first, then whole-day entries, then
timed entries and follow-ups by time. The head says the date and how far it is
from today. An empty day says **Nothing on this day.**

From the list:

- **Click an entry** to open it for editing. Close the entry and you're back on
  the list, updated.
- **Tick an entry's square** to mark it done.
- **Click an attachment** to open it.
- **Click a follow-up** to open its lead in LEADS.
- **Add an entry** files a new one on that day. It's focused when the list
  opens, so a click on the day and then Enter is all it takes.
- **Close**, **Esc** or a click outside puts the list away.

In MONTH, the day's number and **+N MORE** open that day in the DAY lens
instead.

## Filing an entry

![calendar-04-entry.png](calendar-04-entry.png)

1. Start one of these ways:
   - Click a day in MONTH, then **Add an entry** on its list.
   - Click an hour in WEEK or DAY. The dialog opens on that day, at that hour.
   - Press **File entry** in the header, or **Ctrl+N**. With a day's list open,
     Ctrl+N files on that day.
2. Give the entry a title.
3. Set a time, or leave it as an all-day entry.
4. Choose its kind.
5. Add notes, attachments and a checklist if there are any, and press **File
   entry**.

An entry is **your own statement** that something happens on a date. Nothing
you file here is derived from a project, and that boundary is worth keeping: a
delivery date you wrote down should not silently move because a project changed
stage.

Release dates and follow-ups are the two exceptions, and neither is an entry.
See **Release dates** and **Follow-ups** below.

## The five kinds

Each is drawn in one of the palette's materials, so a month reads as a shape
before you read a single word of it.

| Kind        | Asserts                                  | Drawn in     |
| ----------- | ---------------------------------------- | ------------ |
| `SESSION`   | Time set aside at the desk               | Aged brass   |
| `DELIVERY`  | Something owed to somebody on this date  | Brushed gold |
| `BROADCAST` | The console goes live to an audience     | Crimson      |
| `RITE`      | A standing observance the calendar keeps | Concrete     |
| `DEADLINE`  | A cutoff, after which the matter is late | Crimson      |

The two crimson kinds are the two with consequences — a broadcast you have
announced and a cutoff you will miss. That is the palette rule doing its job: the
saturated colour marks what is live or what bites.

```
14 MAR   Ossuary — final master due        DELIVERY
16 MAR   Session: vocal comp               SESSION
21 MAR   Stream — THE CONCORD rehearsal    BROADCAST
28 MAR   Label submission closes           DEADLINE
```

> If you want a date to follow a _project_, put the project's name in the
> entry's title. The register will not do it for you, and that is the feature —
> see the note above about derived dates.

## Reading the month

Entries are drawn as chips on their day, with follow-ups beside them in time
order. Each cell holds three; a day with more says **+N MORE**, which opens it
in DAY. The small figure by the day's number counts the entries filed on it.

The current day is marked. Days outside the anchored month are dimmed but still
live: click one for its list as usual.

## Release dates

A release in the DISCOGRAPHY with a date set appears on that day in all four
lenses, marked with a gold **diamond** rather than drawn as a chip. Clicking it
opens that release.

It is a **reading**, not an entry. There is no dialog behind it, nothing to
tick off, and no way to drag it to another day — the date lives on the release
and the release sheet is where it is changed. Change it there and the marker
moves; remove the release and the marker goes with it. The calendar keeps no
copy of a release date, which is why the two can never disagree.

Everything with a date shows, whether it is still coming or already out. A
release that is out reads dimmer.

> A day holding nothing but a release still says so. In WEEK and DAY the marker
> sits in the **ALL DAY** band, because a release date has no hour.

## Anniversaries

Once a release is **out**, the register keeps its birthday. On the same day in
every year after, a **hollow** diamond appears saying how many years it has
been — `MOVES LIKE JAGGAR · 3 YEARS`. Clicking it opens the release, exactly as
the release marker does.

Hollow rather than filled, and quieter than a release proper, so a day that
carries a record going out **and** the anniversary of an older one reads as two
different things rather than two releases.

Nothing is stored for this. It is worked out from the release dates the
calendar already reads, which is why moving a release date moves every
anniversary with it and deleting a release removes them all.

- Only **released** entries have one. A scheduled record's day has not happened
  yet.
- It starts at **one year on**, so it never doubles up with the release's own
  marker on the original date.
- A record released on **29 February** is marked only in leap years. Printing
  it on the 28th would be recording a date it did not come out on.
- **AGENDA** lists anniversaries for one year ahead of whatever date it opens
  on, which is every record in the catalogue exactly once.

## Follow-ups

Every follow-up from LEADS, on leads and opportunities, is marked on its day, at
its time, in all four lenses. Like a release date, it is read from where it
lives: change its time on the lead and the mark moves; tick it off and the mark
is struck through.

![calendar-06-week.png](calendar-06-week.png)

A mark is a small arrow, then the time, the name and the follow-up:

| Looks like                  | Means             |
| --------------------------- | ----------------- |
| An alabaster arrow and name | Due, not yet done |
| Crimson                     | Overdue           |
| Dimmed and struck through   | Done              |
| A gold **!** at the end     | High priority     |

Hover a mark for the whole of it: who, what, when, its state and priority.
Click it to open its lead (or opportunity) in LEADS, where it is dealt with.
Marks are read-only here: no dragging, no ticking, no dialog.

- **WEEK and DAY**: a mark hangs from a thin rule at its minute, and takes about
  half an hour of room so it never covers an entry. Clicking the empty space
  under it still files an entry at that hour.
- **MONTH**: marks share the cell with entries, in time order, after them.
- **AGENDA**: follow-ups are listed among the day's entries, and a day with
  only a follow-up still appears. When follow-ups dated before where the agenda
  starts are still overdue, the top line says how many, in crimson, so they
  never quietly fall off a list that only looks forward.

Follow-ups are not counted as entries: the day's figure, **N ENTRIES** and
**N FILED** count what is filed in CALENDAR, and a follow-up is filed in
ARTISTS. See the LEADS chapter.

## Marking an entry done

In AGENDA, DAY and a day's list, each entry starts with a small square. Press
it to mark the entry done (discharged, in the register's words); it stays on
the register, marked as done. Press it again to reopen it.

## Attachments and checklists

An entry can carry the things it is about, and the steps within it. Both sit in
the entry dialog under the notes, and both are filed with the entry when you
press **File entry** or **Save**. Cancel, and nothing you added is kept.

**Attachments** are what you would otherwise go looking for when the time comes.
Add them with the buttons under the list:

| Button       | Attaches                                                    |
| ------------ | ----------------------------------------------------------- |
| **File…**    | A file, picked in the Windows dialog. Named after it.       |
| **Folder…**  | A folder, the same way.                                     |
| **Project…** | A project in the ARCHIVE, found by searching its name.      |
| **Link**     | A web address, in full (`https://…`). Named after its site. |

Each row has **Open** and **×**. A project opens in Ableton, a file or folder
with whatever Windows opens it with, and a link in your browser. **×** only
takes it off the entry; the file itself is not touched. An entry holds up to
twelve, and the buttons go once it has them all. If a file has been moved or
deleted since, the register says so rather than opening nothing.

A **checklist** is the steps within an entry. Type a step into the last line and
press Enter to start the next. Tick a step's square when it is done; press **×**,
or clear its text, to remove it. An entry holds up to forty.

On the register, an entry that carries either says so after its title: a
paperclip and a count for its attachments, and `2/5` for its steps, which turns
gold once every one is ticked. AGENDA, DAY and a day's list also list the
attachments by name under the entry; click one to open it.

> When a project is renamed in the ARCHIVE, attachments pointing into it follow
> it to its new name. Nothing needs re-attaching.

> The **quick strip** and **reminders** open an entry's attachments in one click
> as well. That is the point of them: when a session's reminder comes, the
> project it is about is one press away.

## Reminders

A Windows notification comes a few minutes before a timed entry starts: 10 by
default, set (or turned off) in REGULATION under QUICK STRIP. Click it and the
entry opens beside the quick strip, its attachments one press away. With the
console on screen, it opens CALENDAR instead.

## Editing and removing

Click an existing entry to open it for editing. The dialog is the same one used
to file it, with the values filled in; press **Save** to keep the change. To
remove it, press **Strike from register**, then press it again to confirm.

No entry here is tied to anything else in the console, so removing one affects
only the calendar. Release markers and follow-ups are not entries and cannot be
removed from this side at all.
