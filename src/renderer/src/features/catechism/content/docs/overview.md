# The console

Candy Haven is the operator console for the CANDY HEIST practice. It is one
Windows application that files your projects, tracks them from an idea through
to a finished master, serves the overlays your stream is watching, keeps the
dated register of what is due, and reports on the machine it is running on.

![practice-02-vault.png](practice-02-vault.png)

It is built for a single operator, and its remit is deliberately wide: the intent
is that everything the practice involves is filed here rather than spread across
applications that cannot see one another. That is why the console keeps gaining
departments rather than settling — and why records reference one another instead
of being re-entered.

## How it is arranged

![welcome-03-rail.png](welcome-03-rail.png)

Departments are grouped into four divisions. The division tells you what kind of
question a department answers, which is usually enough to know where to look.

| Division       | What it is for                                                   | Departments                                                   |
| -------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| **COMMAND**    | Where the system is seen whole and instructed                    | NEXUS, INTERFACE                                              |
| **PRODUCTION** | The work itself: what is filed, released, due, and how it sounds | ARCHIVE, DISCOGRAPHY, ARTISTS, CALENDAR, AUDITORIUM, DARKROOM |
| **BROADCAST**  | What is served to an audience while it is live                   | OBSERVATORY                                                   |
| **OVERSIGHT**  | The condition of the installation, and the rules it runs under   | TELEMETRY, DISPATCH, REGULATION, CATECHISM                    |

A department marked **RESERVED** is routed and specified but not yet built. Its
page lists what it will do when it is commissioned, so the shape of the finished
console is legible while it is being assembled. INTERFACE is the only reserved
department at present.

## The archive underneath

Every department that remembers anything reads and writes through one private
MongoDB instance that Candy Haven owns and supervises itself.

- It is bound to `127.0.0.1` only, on port `27917` by default — deliberately off
  MongoDB's own `27017`, so it cannot collide with a system installation.
- Its data lives in `%APPDATA%\candy-haven\archive\data`.
- It is never registered as a Windows service. It starts when the console starts
  and stops when it stops.

If the archive is down, most of the console will tell you so rather than
appearing to work. The orb on the NEXUS landing is the fastest way to check.

> DISPATCH is the one exception. Its record is a _shared_ database, because the
> whole point of that department is that two machines see the same board.

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

| What                         | Where                                                              |
| ---------------------------- | ------------------------------------------------------------------ |
| Settings, logs, archive data | `%APPDATA%\candy-haven`                                            |
| Your projects                | Wherever you set the filing root — see [COMMISSIONING](/catechism) |
| Overlay addresses            | `http://127.0.0.1:<port>/<overlay>`                                |

REGULATION's DIAGNOSTICS category lists all of these for the running
installation, with the real resolved paths rather than these templates.
