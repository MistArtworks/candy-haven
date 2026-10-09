# SERVICES

What the website books, and what it offers: DJ enquiries, producer bookings,
and the producer services and hours the website shows. Behind the DISPATCH
sign-in, and checked in with CONTACT's messages.

![services-01-enquiries.png](services-01-enquiries.png)

## Four tabs

- **DJ**: enquiries from the website's "Book me as a DJ" page. The tab counts
  the new ones.
- **PRODUCER**: bookings from "Book me as a music producer", every one already
  paid for. The tab counts the new ones.
- **OFFERINGS**: the services "Book me as a music producer" offers, written
  here and published to the website.
- **HOURS**: when sessions can be booked, published with the services.

**Check for new**, at the end of the tabs' row on DJ and PRODUCER, is the same
check-in as CONTACT's: one press brings in the enquiries, the bookings and the
messages together. OFFERINGS and HOURS have their own bar, for publishing.

## DJ

The website's "Book me as a DJ" page files each enquiry with a reference such
as `DJ-4HM9TQ`. They arrive here exactly as CONTACT's messages do: copied when
the console starts, when someone signs in, or when you press **Check for new**,
readable with the network down, and gone from the page when nobody is signed
in. Signing in works as it does on CONTACT, from a band that reads **Sign in to
open SERVICES**, and signs you in on the other website departments and DISPATCH
too.

| Status      | Means                                  |
| ----------- | -------------------------------------- |
| `NEW`       | Not yet taken up                       |
| `IN TALKS`  | Being discussed with whoever sent it   |
| `CONFIRMED` | Booked                                 |
| `DECLINED`  | Turned down                            |
| `ARCHIVED`  | Done with, and out of the default list |

There is no "read". Having looked at an enquiry is not an answer to it, so a
new one stays new, and keeps the rail's count lit, until it is taken up or
turned down.

Each enquiry in the list shows its reference, the event's name, who sent it and
their budget, how long ago it came, and where it stands. **CONFIRMED** is drawn
in gold and **DECLINED** in crimson; declined and archived ones are drawn
fainter.

## How to find an enquiry

- **Search** looks through the name, the address, the event, the venue, what
  they wrote and the reference.
- **Show** chooses what the list holds. **OPEN**, the default, is what is still
  in play: new and in talks. **ALL** adds the rest; **NEW**, **IN TALKS**,
  **CONFIRMED**, **DECLINED** and **ARCHIVED** show one status each.

The two apply together, and both go back to their defaults when you leave the
page.

## How to take up an enquiry

1. Open the **DJ** tab and press **Check for new**.
2. Pick an enquiry in the list. It opens beside the list. Pick it again, or
   press **Close**, to put it away.
3. Read it. Only what they filled in is shown: **FROM**, their **ROLE** (a
   promoter, a booking agent), **EMAIL**, **PHONE**, the **EVENT**, the
   **VENUE** and the **BUDGET**, then **RECEIVED**, when it arrived, and what
   they wrote about the event.
4. Press **Reply by email**. Your own mail opens with their address, and the
   subject filled in as `Re:` and the event's name (`Re: your booking enquiry`
   when they gave none).
5. Set **Status** to **IN TALKS** while it is being discussed.
6. Keep track in **Note**: dates offered, fees, the set length. It is filed as
   you type.
7. Set **CONFIRMED** once it is booked, or **DECLINED** if it is not happening.
8. When nothing more will come of it, set **ARCHIVED**.

![services-02-enquiry.png](services-02-enquiry.png)

Confirmed and declined enquiries leave the **OPEN** list as soon as they are
set, so the default list is always what still needs you. **ALL** brings them
back.

## Statuses, notes and deleting

They work as they do in CONTACT:

- Statuses and notes are your own tracking. They never leave this machine, the
  other copy of the console does not see them, and both work offline. Any
  status can be set at any time, **NEW** included.
- A note holds up to 4,000 characters and is filed as you stop typing.
- **Delete**, at the foot of an enquiry, asks **Delete from the website and
  here?**; **Delete** again removes it everywhere, and **Keep** changes your
  mind. It cannot be undone. Deleting needs the website, so while it cannot be
  reached the button reads **Connect to delete**.

The status at the top right says when the website was last checked, or what
went wrong; CONTACT's chapter lists what each failure means.

## PRODUCER

![services-03-producer.png](services-03-producer.png)

Every booking here is paid for: a commission's first half, or a 1-1 session's
whole fee. The website files each with a reference such as `CH-K3P2Q8`, and it
arrives with the same check-in as the enquiries. A booking changes after it is
made (the other half paid, a session moved or cancelled), and each change
arrives with the next check-in too.

Each booking in the list shows its reference, the service, who booked it, a
session's day and time or a commission's payment (**Half paid**, **Paid in
full**), how long ago it came, and where it stands. Open one to see:

- **KIND**, and for a session **WHEN** (in this PC's time), **THEIR TIME** when
  they booked from another zone, its **LENGTH**, and where it **MEETS ON**:
  Google Meet, or Discord with the Meet link as a fallback.
- Who booked it: **FROM**, **EMAIL**, **PHONE**, **INSTAGRAM**, **DISCORD**.
- **PAID**, and for a commission **THE OTHER HALF**: what is due and its invoice,
  or when it was paid.
- What they wrote when they booked.

Then the buttons:

| Button                 | Does                                                                        |
| ---------------------- | --------------------------------------------------------------------------- |
| **Reply by email**     | Your mail, with their address and `Re:` the service and reference           |
| **Open the Meet link** | The session's Google Meet                                                   |
| **Copy the pay link**  | The website's page for the commission's other half, to send when it's ready |
| **See the payment**    | The payment in Stripe                                                       |

Status and note work as DJ's do, kept on this machine:

| Status        | Means                          |
| ------------- | ------------------------------ |
| `NEW`         | Not yet taken up               |
| `IN PROGRESS` | Being worked on, or prepared   |
| `DONE`        | Delivered, or the session held |
| `ARCHIVED`    | Done with                      |

**Show** chooses what the list holds: **OPEN** (not done with and not
cancelled, the default), **UPCOMING SESSIONS**, **COMMISSIONS**,
**CANCELLED**, **ALL**, or one status.

## How to move or cancel a session

Both are done on the website, which keeps the open times: it frees the old time,
moves or takes away the event on Candy's Google Calendar (Google sends the
client the updated invitation), and emails the client. Both need the website,
so offline the button reads **Connect to move or cancel**.

1. Open the session and press **Move to another time**.
2. Pick the **Day**, and the **Time, here** (every quarter hour). Their time is
   shown beneath. Press **Move it**, or Enter.
3. A time another booking holds is refused. One with something else on the
   calendar asks first, and **Move it anyway** moves it.

![services-08-move.png](services-08-move.png)

To cancel a session still to come, press **Cancel the session**. **A note to
them** is optional: why, and what happens next (another time, or a refund). It
goes in their email. Press **Cancel the session** again to cancel it. Any refund
is yours to make in Stripe: **See the payment**.

After either, the notice says what was done: whether the calendar changed, and
whether the client was emailed. When Google isn't connected on the website,
neither happens, and the notice says to write to them yourself.

## OFFERINGS

![services-04-offerings.png](services-04-offerings.png)

Every service "Book me as a music producer" offers, in the order the website
lists them, with the one open beside the list. A service kept off the website
is drawn fainter. Each row says where it stands:

| Tag        | Means                         |
| ---------- | ----------------------------- |
| `LIVE`     | On the website as it is here  |
| `CHANGED`  | Edited since it was published |
| `NOT LIVE` | New here, not published yet   |
| `HIDDEN`   | Kept here, off the website    |

Nothing reaches the website until **Publish**. Drag a row by its grip, or use
its arrows, to change the order; the website follows with the next publish.

### Starting out

With nothing here yet, **Start from the website's list** brings in what the
website offers now: every service with its address, its write-up and its photo,
and the hours too, ready to edit. **New service** starts one from nothing: a
name, and whether it is a **Commission** (made for the client, half paid upfront)
or a **1-1 session** (booked at a time, paid in full); **Make it** adds it to the
list, kept here until you publish.

### What a service has

- **Name**, and its **Address** on the website (`?service=` on the producer
  page). **Match the name** makes the address from the name. It can change
  until it is published; after that it stays, so links to it, and the home
  page's list, keep working.
- **Kind**: Commission or 1-1 session. A session has a **Length**, and every
  start time in HOURS is a session this long.
- **Glyph**: the mark beside it on the home page and in its testimonials.
- **One line**, under the name on its card.
- **Price, CAD**. Without a price it shows, but can't be booked online.
- **Facts**, as label and value (`Format · Per track`, `Length · 60 min`), up to
  six; the first sits in the booking summary.
- **Photo**: one picture, at least 1200 pixels wide and 800 tall. The website
  cuts two shapes from it, the card in the list and the banner over the details,
  around whatever draws the eye; the two frames here show them roughly. Say what
  it shows in **What it shows**, for people who can't see it. A photo picked
  here goes to the website with the next publish.
- **The write-up**, in the website's markdown, with LORE's bar over it: Write,
  Side by side with the website's reading of it, or Preview.
- **Show it on the website**: off keeps it here only.

![services-05-write-up.png](services-05-write-up.png)

Saving is the console's unsaved-changes bar: **File changes**, or **Discard**.
Until then the service's tag reads `UNSAVED`. Under the fields, a list says
anything that would stop the service going to the website. **Delete**, at the
foot, asks first; **Delete** again takes it off this PC, and **Keep it** changes
your mind. One on the website comes off it with the next publish.

## HOURS

![services-07-hours.png](services-07-hours.png)

When the website lets people book a 1-1 session:

- **The week**: the start times for each day, in Candy's zone. **Add a time**
  adds one (every quarter hour); a time's **×** takes it off. **Same on the other
  open days** gives every other day that has sessions the same times.
- **Days off**: a day here has no times, whatever the week says. Pick it, or type
  it and press Enter.
- **The rules**: the **Time zone** the times are read in; the **Notice** a
  session needs; **How far ahead** it can be booked; **A break between
  sessions**.

Visitors see the times in their own zone. Anything on Candy's Google Calendar,
and every session already booked, shows as taken on the website whatever these
say. Until hours are saved here, the tab shows the website's, to start from.
They are saved with the unsaved-changes bar, as a service is.

## Publishing

The bar over OFFERINGS and HOURS says what the website has, and what a publish
would change:

| It reads                            | Means                                                               |
| ----------------------------------- | ------------------------------------------------------------------- |
| `NOT FETCHED YET`                   | The website hasn't been asked yet: **Check the website**            |
| `THE WEBSITE SHOWS ITS OWN LIST`    | Nothing has been published from a console yet                       |
| `CHANGES TO PUBLISH`                | New, changed or taken-off services, the hours, or the order         |
| `UP TO DATE`                        | The website offers what is here                                     |
| `PUBLISHED FROM THE OTHER COMPUTER` | The other copy of the console published since the list here started |

What the website has is fetched the first time OFFERINGS or HOURS opens, since
the other person may have published; **Check the website** fetches it again.

**Publish** sends the whole list, the services shown in this order, with the
hours, in one go. Anything unsaved comes first: the unsaved-changes bar asks for
a save or a discard. The first publish asks before it switches the website from
its own list.

![services-06-first-publish.png](services-06-first-publish.png)

Both of you can publish, each from your own copy of the console. When the other
person published after the list here started from the website, the bar says so,
and a publish asks first: **Publish mine over theirs**, **Take theirs** (the list
and the hours here become the website's), or Cancel to compare first.

## Being told

New enquiries and new bookings are counted beside SERVICES on the rail, on their
tabs, and in the notice the console gives after its first check-in. Clicking
that notice opens SERVICES when it has no messages to point at, on PRODUCER when
only bookings are waiting. While COMMUNITY is folded away on the rail, its
heading carries a mark for anything waiting.
