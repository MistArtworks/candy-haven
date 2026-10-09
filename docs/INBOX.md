# The website inbox: CONTACT and SERVICES

What the website's visitors send, and how it reaches this console. Added
2026-10-01; producer bookings, and publishing the producer services and hours,
added 2026-10-09. Read this before touching `services/inbox/`,
`services/offerings/`, the website's `/api/haven/*`, or either department's
page.

## The flow

1. A visitor sends the contact form or "Book me as a DJ" on the website
   (candy-heist, a Next.js site on Vercel).
2. A Server Action on the website checks it quietly for spam (a hidden field, a
   minimum time to fill, an hourly limit per visitor), files it in the
   website's MongoDB Atlas database with a reference (`MSG-7KQ2XD`, `DJ-4HM9TQ`)
   and its date, and shows the visitor "Sent". That is all the website keeps:
   no status, no notes. No email is sent anywhere.
3. A visitor who books "Book me as a music producer" pays with Stripe first:
   half a commission upfront, a 1-1 session in full. Once the payment
   succeeds the website files the booking (`CH-K3P2Q8`), puts a session on
   Candy's Google Calendar with a Meet link, and emails both sides. A
   commission's other half is paid later on the website's `/services/pay`,
   against its invoice (`CH-K3P2Q8-2`).
4. This console checks in with the website's private API when it starts, when
   someone signs in to DISPATCH, and when the operator presses **Check for
   new**, and keeps a copy of what it finds in the archive. Nothing runs on a
   timer.
5. CONTACT and SERVICES read the copy. Statuses and notes are set on the copy
   and never leave this machine. A deletion is sent to the website first and
   then applied here, so it reaches the other copy of the console too. Moving
   or cancelling a session is done by the website, and the copy takes its
   answer.
6. SERVICES also writes what the website offers: the producer services and
   the hours sessions can be booked in. They are kept here until **Publish**,
   which sends the whole list at once; from the first publish on, the website
   shows only what was published.

```
visitor ─▶ website (Server Action, Stripe) ─▶ Atlas
                                                ▲
console ─(Bearer Firebase ID token)─▶ /api/haven/* ─┘
   │
   └─▶ local archive: site_contact_messages, site_dj_enquiries, site_bookings,
                      sync_state, services_offerings, services_hours,
                      services_links, services_cache
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

Stripe, Google and Supabase keys stay on the website too. The console asks the
website to move a session or store a photo; it never talks to those services
itself.

## The website's API

Every call needs the bearer token, and answers `Cache-Control: no-store`.
There is no call to set a status: the website has nowhere to keep one.

| Call                                    | Does                                                               |
| --------------------------------------- | ------------------------------------------------------------------ |
| `GET /api/haven/inbox?since=<ISO>`      | Messages and enquiries sent, and deletions, since `since`          |
| `DELETE /api/haven/messages/<id>`       | 204, also when already gone; leaves a deletion record              |
| `DELETE /api/haven/enquiries/<id>`      | The same                                                           |
| `GET /api/haven/bookings?since=<ISO>`   | Producer bookings changed since `since`, each with its invoice     |
| `POST /api/haven/bookings/<ref>/move`   | `{ start, force }`: moves a session to another time                |
| `POST /api/haven/bookings/<ref>/cancel` | `{ note }`: cancels a session still to come                        |
| `GET /api/haven/services`               | What the website offers now: the list, the hours, and its revision |
| `PUT /api/haven/services`               | `{ items, hours, baseRevision, force }`: publishes the whole list  |
| `PUT /api/haven/services/photo`         | A photo's bytes; answers the addresses of its two shapes           |

The inbox answer is `{ messages, enquiries, deletions, cursor, more }`, at most
200 of each. The bookings answer is `{ bookings, cursor, more }`, at most 200,
oldest change first. `cursor` is where to ask from next; `more` means ask again
now. Dates are ISO strings; the copy stores them as epoch milliseconds.

503 with `not_configured` means the website has no settings for this yet; 503
with `database_unavailable` means it cannot reach Atlas. Both are shown on the
page as they are.

## Statuses

The operator's own tracking, in `inbox.constants.ts`, kept on this machine
beside the notes (decided 2026-10-01). Every copy starts `new`.

- Messages: `new`, `read`, `replied`, `archived`. Opening a new one reads it.
- DJ enquiries: `new`, `in_talks`, `confirmed`, `declined`, `archived`. No
  `read`: a new enquiry stays new until it is taken up or turned down.
- Producer bookings: `new`, `in_progress`, `done`, `archived`. A cancelled
  booking keeps its status; the cancellation is the website's, shown in its
  place, and a cancelled one is not counted as waiting.

Because they are local, each copy of the console keeps its own. Two people
using CONTACT on two machines see the same messages, and the same deletions,
but not each other's statuses or notes.

## The copy

- `site_contact_messages`, `site_dj_enquiries` and `site_bookings`, keyed by
  the website's id, each document carrying the `website` (an origin) it came
  from. Every read filters on it.
- `sync_state`, one document per website holding its cursor, and one more per
  website (`<origin> bookings`) for the bookings'.
- `status` and `note` are the operator's and are never sent. A copy is
  inserted as `new` with an empty note, and no later check-in touches either.
- A booking changes on the website after it is made (the other half paid, a
  session moved or cancelled). Each change moves the booking's `updatedAt`, so
  the next check-in brings it again, and the website's part of the copy is
  replaced whole.
- Deletions come down as their own list and remove the copy wherever it is
  filed. The website keeps them for a year, so a copy of the console that has
  been off for less than that still hears of them. Bookings are never deleted.

## Moving and cancelling a session

The website keeps the open times, so it does both:

- **Move** takes the new start; the length stays. It is refused with 409
  `taken` when another session holds that time (never forced), and with 409
  `busy` when Candy's calendar has something else on then or could not be read
  (`force: true` moves it anyway). 409 `out_of_date` means it changed on the
  other computer first, and 409 `cancelled` that it is cancelled already. A
  time already past, or the one it is at, is 400 `invalid` with a message to
  show.
- **Cancel** is for a session still to come (400 `invalid` once its time has
  passed). The note, up to 1,000 characters, goes in the client's email.
  Refunds stay in Stripe, by hand.
- Both answer `{ booking, calendar, email }`. `calendar` is `updated`,
  `removed`, `not-connected` or `failed`; `email` is `sent`, `not-connected`
  or `failed`. The page says what was and wasn't done, so the operator knows
  when to fix the calendar or write to the client by hand. The calendar event
  keeps its Meet link when it moves, and Google sends the client the updated
  invitation.

## Publishing the services

- `services_offerings` holds the list as written here, one document per
  service in its order; `services_hours` holds the hours, one document. Both
  belong to the console rather than to a website, as LORE's drafts do. The
  photos are copied into the console's media store (`services`) when picked.
- `services_links` holds, per website, the revision the list here started from
  (`baseRevision`: an import, the last publish, or taking theirs) and what each
  service was then, so the page can tell what changed. `services_cache` is
  what each website offers, as last fetched, for reading only.
- **Publish** sends every service and the hours in one `PUT`, which the website
  checks against its own limits (`lib/services/model.ts`; the console checks
  the same ones first, in `offerings.constants.ts`) and keeps as one document,
  `services_published`. 400 `invalid` carries the first problem as a message.
  When the other copy of the console published after `baseRevision`, it
  answers 409 `conflict` with what the website has now, unless `force` is set.
- A photo goes first, once per website: a PNG, JPEG or WebP up to 8 MB, though
  a host may refuse a request over about 4.5 MB, so one over 4 MB is turned
  upright and brought down to 2400 pixels on its long side here. The website
  refuses one smaller than 1200 × 800, cuts the card (700 × 1000) and the
  banner (1600 × 609) around whatever draws the eye, stores both as WebP in its
  Supabase storage beside the release covers, and answers `{ card, wide }`.
  503 `storage_unconfigured` means it has no storage set up.
- A service's address (`?service=` on the producer page) is fixed once it is
  published: the website's home page lists its sessions by address, in its own
  files, and one it can't find just drops off the list.
- After a publish the website remakes `/services/producer` and the home page.
  Until the first one, and on a server with no database, it shows its own
  files (`src/content/services/`).

## Which website

`InboxService.website`: REGULATION's **Website address** when set; otherwise
`https://candy-heist.vercel.app` when installed and `http://localhost:3000`
when run from source. The setting is empty by default because the installed
console and a development copy share `settings.json`, and one address stored
there would point the other at the wrong website.

A development copy therefore reads the development server, whose database is
`candy_heist_dev`, and keeps its copy apart from the live one by the `website`
field. The archive itself is shared: it describes real folders on disk, and a
second archive for development would drift away from them. The services list
is shared with it, so a development copy publishing to the development website
publishes the list the installed one would; what each website was last sent
stays apart, in `services_links`.

## When it checks

On startup, on signing in, when REGULATION's address changes, and when the
operator presses **Check for new** on either page. Never on a timer, by the
operator's choice (2026-10-01): new arrivals are seen when someone looks, and
the website is not asked anything while nobody is. OFFERINGS and HOURS fetch
what the website offers the first time either opens on a visit to SERVICES
(the other person may have published since), and with **Check the website**.

## Alerts

- The rail counts what is waiting (new messages, new enquiries, new bookings)
  beside each department, and marks COMMUNITY's heading while it is folded.
- The first check-in of a session, however it goes, raises one Windows
  notification summarising what is waiting, if anything is. There is no
  notification per arrival: without a timer, the only other check-ins are the
  operator's own, made while looking at the page.
- Clicking the notification reveals the console and opens the department
  (`inbox:open`): CONTACT when messages are waiting, SERVICES for enquiries,
  and SERVICES' PRODUCER tab when only bookings are. Unless the page showing
  holds unsaved changes.

## Signed out

Nothing is fetched, the lists come back empty, every write is refused, and the
waiting counts are zero. The copy stays in the archive, unshown. OFFERINGS and
HOURS show nothing either; what is written there stays in the archive too.
