# The website inbox: CONTACT and SERVICES

What the website's visitors send, and how it reaches this console. Added
2026-10-01. Read this before touching `services/inbox/`, the website's
`/api/haven/*`, or either department's page.

## The flow

1. A visitor sends the contact form or "Book me as a DJ" on the website
   (candy-heist, a Next.js site on Vercel).
2. A Server Action on the website checks it quietly for spam (a hidden field, a
   minimum time to fill, an hourly limit per visitor), files it in the
   website's MongoDB Atlas database with a reference (`MSG-7KQ2XD`, `DJ-4HM9TQ`)
   and its date, and shows the visitor "Sent". That is all the website keeps:
   no status, no notes. No email is sent anywhere.
3. This console checks in with the website's private API when it starts, when
   someone signs in to DISPATCH, and when the operator presses **Check for
   new**, and keeps a copy of what it finds in the archive. Nothing runs on a
   timer.
4. CONTACT and SERVICES read the copy. Statuses and notes are set on the copy
   and never leave this machine. A deletion is sent to the website first and
   then applied here, so it reaches the other copy of the console too.

```
visitor ─▶ website (Server Action) ─▶ Atlas
                                        ▲
console ─(Bearer Firebase ID token)─▶ /api/haven/* ─┘
   │
   └─▶ local archive: site_contact_messages, site_dj_enquiries, sync_state
```

## Why the console never holds the database password

This repository and its installers are public. A connection string in either is
a connection string for anyone. So the console reaches Atlas only through the
website, and the website decides who gets in:

- The console sends the ID token its DISPATCH sign-in already holds
  (`DispatchService.idToken`), as `Authorization: Bearer …`.
- The website verifies it against Google's published keys (issuer
  `https://securetoken.google.com/<project>`, audience the project id), then
  checks the account id against its allow-list of the two accounts
  (`HAVEN_ALLOWED_UIDS`). A real token for any other account is refused (403).
- Failed attempts are limited to 30 an hour per address, then 429.
- Firebase sign-ups should stay disabled in the Firebase console: the
  allow-list is what makes a new account useless, and disabled sign-ups are
  what stops one being made.

## The website's API

Both need the bearer token, and answer `Cache-Control: no-store`. There is
no call to set a status: the website has nowhere to keep one.

| Call                               | Does                                                      |
| ---------------------------------- | --------------------------------------------------------- |
| `GET /api/haven/inbox?since=<ISO>` | Messages and enquiries sent, and deletions, since `since` |
| `DELETE /api/haven/messages/<id>`  | 204, also when already gone; leaves a deletion record     |
| `DELETE /api/haven/enquiries/<id>` | The same                                                  |

The inbox answer is `{ messages, enquiries, deletions, cursor, more }`, at most
200 of each. `cursor` is where to ask from next; `more` means ask again now.
Dates are ISO strings; the copy stores them as epoch milliseconds.

503 with `not_configured` means the website has no settings for this yet; 503
with `database_unavailable` means it cannot reach Atlas. Both are shown on the
page as they are.

## Statuses

The operator's own tracking, in `inbox.constants.ts`, kept on this machine
beside the notes (decided 2026-10-01). Every copy starts `new`.

- Messages: `new`, `read`, `replied`, `archived`. Opening a new one reads it.
- DJ enquiries: `new`, `in_talks`, `confirmed`, `declined`, `archived`. No
  `read`: a new enquiry stays new until it is taken up or turned down.

Because they are local, each copy of the console keeps its own. Two people
using CONTACT on two machines see the same messages, and the same deletions,
but not each other's statuses or notes.

## The copy

- `site_contact_messages` and `site_dj_enquiries`, keyed by the website's id,
  each document carrying the `website` (an origin) it came from. Every read
  filters on it.
- `sync_state`, one document per website, holding its cursor.
- `status` and `note` are the operator's and are never sent. A copy is
  inserted as `new` with an empty note, and no later check-in touches either.
- Deletions come down as their own list and remove the copy wherever it is
  filed. The website keeps them for a year, so a copy of the console that has
  been off for less than that still hears of them.

## Which website

`InboxService.website`: REGULATION's **Website address** when set; otherwise
`https://candy-heist.vercel.app` when installed and `http://localhost:3000`
when run from source. The setting is empty by default because the installed
console and a development copy share `settings.json`, and one address stored
there would point the other at the wrong website.

A development copy therefore reads the development server, whose database is
`candy_heist_dev`, and keeps its copy apart from the live one by the `website`
field. The archive itself is shared: it describes real folders on disk, and a
second archive for development would drift away from them.

## When it checks

On startup, on signing in, when REGULATION's address changes, and when the
operator presses **Check for new** on either page. Never on a timer, by the
operator's choice (2026-10-01): new arrivals are seen when someone looks, and
the website is not asked anything while nobody is.

## Alerts

- The rail counts what is waiting (new messages, new enquiries) beside each
  department, and marks PUBLICATION's heading while it is folded.
- The first check-in of a session, however it goes, raises one Windows
  notification summarising what is waiting, if anything is. There is no
  notification per arrival: without a timer, the only other check-ins are the
  operator's own, made while looking at the page.
- Clicking the notification reveals the console and opens the department
  (`inbox:open`), unless the page showing holds unsaved changes.

## Signed out

Nothing is fetched, the lists come back empty, every write is refused, and the
waiting counts are zero. The copy stays in the archive, unshown.

## Not built yet

Producer bookings (SERVICES → PRODUCER) wait for the website to take payment:
a commission is filed when its 50% deposit is paid, a one-to-one when it is
paid in full.
