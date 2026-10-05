# The console

Candy Haven is the operator console for the CANDY HEIST practice. It is one
Windows application that files your projects, tracks them from an idea through
to a finished master, serves the overlays your stream is watching, keeps the
dated register of what is due, follows up with the people you want to work
with, and reports on the machine it is running on.

![practice-02-vault.png](practice-02-vault.png)

It is built for a single operator, and its remit is deliberately wide: the intent
is that everything the practice involves is filed here rather than spread across
applications that cannot see one another. That is why the console keeps gaining
departments rather than settling — and why records reference one another instead
of being re-entered.

## Three windows and a tray icon

Candy Haven is one application that shows itself in more than one place.

| Where               | What it is for                                                                  |
| ------------------- | ------------------------------------------------------------------------------- |
| **THE QUICK STRIP** | A small window on top of everything: your pins, today, follow-ups and reminders |
| **The console**     | Every department, on the rail. Where the work is done                           |
| **The vestibule**   | A launcher with four doors: the console, a new project, ARCHIVE and OBSERVATORY |
| **The tray icon**   | The way back to the console or the strip, the archive's state, and quitting     |

![strip-01-panel.png](strip-01-panel.png)

The strip is the one you see first. It opens when Haven starts, and it takes
turns with the console: while the console is on screen the strip steps aside,
and when you close the console, retire it to the tray or minimise it, the strip
is back where you left it. Most things don't need the console at all. A pin
opens a project in Ableton, a folder, a file or a website, and the strip's
Today ticks off what is due. [QUICK STRIP](/catechism?chapter=strip) covers it
in full.

### What opens at launch

REGULATION → STARTUP → **At launch** decides. The strip comes up beside
whichever you choose, as long as **Show the strip** is on.

| At launch     | Opens                                                |
| ------------- | ---------------------------------------------------- |
| `QUICK STRIP` | The strip alone. The default                         |
| `VESTIBULE`   | The vestibule as well: a new project, or the console |
| `CONSOLE`     | The console as well                                  |

Haven starts with Windows only if **Launch at sign-in** is on, in the same
category; it is off until you turn it on. A launch at sign-in with **Start in
the tray** on, the default, shows the strip alone: the vestibule is skipped,
and the console waits in the tray.

### How to reach the console

From the strip, any of these:

- The pin called **The console**, which a new strip starts with.
- A department pin. A new strip starts with **Archive**, **Discography** and
  **Calendar**, and each opens the console at that department.
- **More** (the three dots) → **Open the console**.
- The gear, which opens the console at REGULATION's QUICK STRIP settings.

From anywhere else:

- Click the tray icon, or right-click it and choose **Open Console**.
- Start Candy Haven again while it is running. The copy that is running brings
  its console up instead of starting a second one.

### Closing is not quitting

The console's own close button retires it to the tray (**Close retires to the
tray**, on by default). While the strip is running, even `Alt`+`F4` and the
taskbar's **Close** only close the console window: the strip, the archive, the
overlay server and the reminders carry on.

![strip-08-quit.png](strip-08-quit.png)

To end the session, quit from one of three places:

1. The power button at the end of the strip's tools. The first press arms it:
   it turns red and reads "Press again to quit Candy Haven". A second press
   within three seconds quits.
2. **More** → **Quit Candy Haven**, on the strip.
3. **Quit Candy Haven**, on the tray icon's menu.

Quitting stops everything: the archive, the overlay server, chat and the
reminders.

> **Hide the strip**, in the strip's **More** menu, puts the strip away
> without quitting. **Show the Quick Strip** on the tray icon, or **Show the
> strip** in REGULATION → QUICK STRIP, brings it back.

## How it is arranged

![welcome-03-rail.png](welcome-03-rail.png)

Departments are grouped into four divisions. The division tells you what kind of
question a department answers, which is usually enough to know where to look.
One division is open on the rail at a time, the one you are in; press another's
heading to look inside it. A red mark on a closed division means something in
it is waiting from the website: a message in CONTACT or an enquiry in SERVICES.
The arrow beside **DIRECTORY** hides the rail (`Ctrl`+`]`).

| Division        | What it is for                                                                           | Departments                                                   |
| --------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **COMMAND**     | Where the system is seen whole and instructed                                            | NEXUS, INTERFACE                                              |
| **PRODUCTION**  | The work itself: what is filed, released, due, and how it sounds                         | ARCHIVE, DISCOGRAPHY, ARTISTS, CALENDAR, AUDITORIUM, DARKROOM |
| **PUBLICATION** | What the public sees and sends: the stream while it is live, and the website at any hour | OBSERVATORY, COLOPHON, CONTACT, SERVICES, LORE, RELEASES      |
| **OVERSIGHT**   | The condition of the installation, and the rules it runs under                           | TELEMETRY, DISPATCH, REGULATION, CATECHISM                    |

A department marked **RESERVED** is routed and specified but not yet built. Its
page lists what it will do when it is commissioned, so the shape of the finished
console is legible while it is being assembled. INTERFACE and COLOPHON are
reserved at present; COLOPHON's page says it is coming soon while it is
reworked.

Some departments look at more than one thing, and a row of lenses under the
masthead switches between them. ARTISTS, for one, holds three: **ROSTER**, the
people the practice works with; **LEADS**, the people you are building a
relationship with; and **OPPORTUNITIES**, the work that came of them.

## What is due, and where it shows

Anything with a time on it reaches you wherever you are, not only in its own
department.

| What                                  | Where it shows                                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| A CALENDAR entry                      | The strip's Today, and CALENDAR. A timed entry also brings a notification, 10 minutes before by default                |
| A follow-up on a lead or opportunity  | The strip's Today, the follow-ups card on NEXUS, CALENDAR's four lenses, the top of LEADS, and a notification when due |
| A message or an enquiry from the site | The red mark on the rail, CONTACT or SERVICES, and a notification after the first check-in of a session                |

Follow-ups are the strip's priorities. An overdue one leads the Today row in
red, and in the Horizontal and Vertical looks the today chip turns red with a
person on it. On NEXUS the card sits at the top right of the landing, under
SONOALCHEMY, with overdue ones in crimson; **–** folds it to a small mark, and
a new follow-up brings it back. In CALENDAR a follow-up is a read-only mark:
pressing it opens its lead, or its opportunity, in ARTISTS.

Notifications are Windows' own. A clicked reminder opens where you can act on
it: in the console, if the console is on screen, and on the strip otherwise.
REGULATION sets each kind: QUICK STRIP → **Reminders** for CALENDAR, and
LEADS → **Remind me** for follow-ups.

## The archive underneath

Every department that remembers anything reads and writes through one private
MongoDB instance that Candy Haven owns and supervises itself.

- It is bound to `127.0.0.1` only, on port `27917` by default — deliberately off
  MongoDB's own `27017`, so it cannot collide with a system installation.
- Its data lives in `%APPDATA%\candy-haven\archive\data`.
- It is never registered as a Windows service. It starts when the console starts
  and stops when it stops.

If the archive is down, most of the console will tell you so rather than
appearing to work. The NEXUS landing is the fastest way to check: the line
beneath the wordmark names the archive's state in words, and the title bar
carries it on every page. The strip carries it too, beside who is signed in.

> DISPATCH is one exception. Its record is a _shared_ database, because the
> whole point of that department is that two machines see the same board.
>
> CONTACT and SERVICES are the other. What visitors send is kept by the
> website, and the archive keeps a copy of it, fetched when the console starts
> or when you ask.
>
> LORE and RELEASES run the other way. What they hold is written into the
> archive here, and the website receives it only when it is published.
>
> LEADS and OPPORTUNITIES are the archive's like everything else. They stay on
> this PC and never reach the website.

## Reading the interface

The console is written in a consistent register, and knowing the conventions
saves a lot of hunting.

- **Everything is numbered.** Departments, panels, settings categories, list
  rows. The number is a position, not a priority.
- **Uppercase is a label; sentence case is prose.** A word in uppercase names
  something the application has a concept of.
- **Crimson means focal or live.** It is the only saturated colour in the
  palette and it is never decorative — a crimson mark is either the one focal
  object of a view, something currently happening, or something destructive.
- **A rule under a heading means the section has started.** Mastheads always run
  number, label, purpose, rule, epigraph.

## Where the files are

| What                         | Where                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| Settings, logs, archive data | `%APPDATA%\candy-haven`                                                                   |
| Your projects                | Wherever you set the filing root. See [COMMISSIONING](/catechism?chapter=getting-started) |
| Overlay addresses            | `http://127.0.0.1:<port>/<overlay>`                                                       |

REGULATION's DIAGNOSTICS category lists all of these for the running
installation, with the real resolved paths rather than these templates.
