# CALENDAR

The dated register: sessions, deliveries and observances. Four lenses over one
array of entries.

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

MONTH and AGENDA answer different questions. MONTH is _where does the work
fall_ — shape, clustering, the empty week you did not notice. AGENDA is _what is
next_, in order, with no gaps to read past.

## Filing an entry

![calendar-04-entry.png](calendar-04-entry.png)

1. Click a day in MONTH, or an hour in WEEK or DAY. The dialog opens on that
   date, and at that hour if you clicked one.
2. Give the entry a title.
3. Set a time, or leave it as an all-day entry.
4. Choose its kind.

An entry is **your own statement** that something happens on a date. Nothing
here is derived from a project or a release, and that boundary is worth keeping:
a delivery date you wrote down should not silently move because a project
changed stage.

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

> If you want a date to follow a project, put the project's name in the entry's
> title. The register will not do it for you, and that is the feature — see the
> note above about derived dates.

## Reading the month

Entries are drawn as chips on their day. A day with more entries than fit shows
a count; open the day to see them all.

The current day is marked. Days outside the anchored month are dimmed but still
live — clicking one moves the anchor rather than refusing.

## Editing and removing

Click an existing entry to open it for editing. The dialog is the same one used
to file it, with the values filled in.

Nothing here is tied to anything else in the console, so removing an entry
affects only the calendar.
