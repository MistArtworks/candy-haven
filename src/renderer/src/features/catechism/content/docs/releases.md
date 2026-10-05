# RELEASES

DISCOGRAPHY, as the website shows it: which releases visitors see, the home
page shelf, and the covers. Behind the DISPATCH sign-in.

![releases-01-list.png](releases-01-list.png)

## What it does

The catalogue itself stays in DISCOGRAPHY, on this machine, and is written and
corrected there. RELEASES sends it to the website and decides how the website
shows it: which releases visitors see, which sit on the home page shelf and in
what order, and the covers, which the website turns into its cover images and
the shelf's tapes.

It uses the DISPATCH sign-in, like CONTACT, SERVICES and LORE. Until someone
signs in, a band across the page reads **Sign in to open RELEASES**, and
nothing is fetched or sent. Signing in here, or on any of them, opens them all.

## What the website gets

| Goes to the website                                           | Stays on this machine              |
| ------------------------------------------------------------- | ---------------------------------- |
| Title, subtitle, kind, status and release date                | Notes                              |
| The artist line: who it is billed as, and who it features     | Masters, projects and files        |
| The label, and the credits by the names on the roster         | Real names from ARTISTS            |
| Each track's title and length, and its artist when it differs | Codes other than the UPC and ISRCs |
| Stream and pre-save links, for the platforms the website has  | Links to any other platform        |
| The UPC and the ISRCs, which the website never shows          | The canvas                         |
| The cover, shrunk                                             |                                    |

The website has buttons for Spotify, Apple Music, YouTube Music, YouTube,
SoundCloud, Deezer and Tidal. A release with links to anything else (Bandcamp,
say) still goes, and its row says **Not on the website:** and which ones. A
release with nobody billed goes out under the name on your own record in
ARTISTS, the one marked **This is me**.

## The page

| Part                           | What it is                                                          |
| ------------------------------ | ------------------------------------------------------------------- |
| **Website**, top right         | Which website this page sends to, and when it was last fetched      |
| The filters                    | **ALL**, **SHOWN**, **HIDDEN** and **TO SEND**, each with its count |
| **Sync now**                   | Sends everything new, changed or waiting, together                  |
| **Check for new**              | Fetches what the website has now. Sends nothing                     |
| The activity strip             | What is going to the website at this moment                         |
| **01 HOME PAGE SHELF**         | The eight places on the website's home page, in order               |
| **02 RELEASES**                | Every release in DISCOGRAPHY, with where each stands                |
| **03 FROM THE OTHER COMPUTER** | What the other copy of the console sent, when there is any          |
| The **Update** bar             | Rises from the foot of the page while anything is picked to send    |

The page fetches what the website has each time it opens, and again with
**Check for new**. Until RELEASES has been published once, it shows only the
**Publish everything** panel.

Of the filters, **SHOWN** is what visitors see, and **HIDDEN** everything else,
releases not sent yet included. **TO SEND** is whatever is new, changed,
waiting, or has a cover to send. They count this computer's releases only.

## How to publish everything, once

Until this is done the website shows its own releases.

1. Open RELEASES. The page fetches what the website has first; until it has,
   it says **Fetching what the website has first…** and the button waits.
2. Read the groups under the button. Each lists its releases with their kind,
   date and tracks:
   - **Shown on the website**: out already, or scheduled, so visitors see them
     as soon as they are sent.
   - **Drafts, kept hidden**: not out yet. They go too, and stay hidden until
     they are scheduled or their day comes.
   - **Can't go yet**: each with why. These stay here until they are fixed in
     DISCOGRAPHY.
3. Press **Publish everything**. The console asks **Publish everything?**,
   naming the website and how many releases go.
4. Press **Publish**, with the count beside it, to go ahead.

Every release that can go is sent in one request, and the website switches
over for good: its own releases are not shown again, and from then on it shows
only what is sent from here. The covers follow on their own, one at a time.
The page then shows the shelf, the list and the filters.

## After that, a release goes on Done

1. In DISCOGRAPHY, open the release and press **Edit**.
2. Change what needs changing. Every field is saved here as you go.
3. Press **Done**, or close the sheet. The fields that changed since it was
   last sent go to the website, and nothing else, so an edit the other computer
   made to another field isn't undone.

A release raised in DISCOGRAPHY since goes the first time its sheet is done
with. A release turning RELEASED on its day goes by itself, the same way. A
release deleted from DISCOGRAPHY comes off the website, its cover and tape with
it, now or as soon as the website can be reached.

If the website can't be reached, a release sent before waits, reads **WAITING
TO SEND**, and goes with **Sync now**, on signing in, or when the console
starts. One never sent stays **NOT SENT** and goes with **Sync now**. An edit
made while nobody is signed in is not sent then; the release reads **CHANGED**
until **Sync now** or **Send** takes it.

| Chip                | Means                                                |
| ------------------- | ---------------------------------------------------- |
| `NOT SENT`          | The website has never had it from here               |
| `ON THE WEBSITE`    | The website has it as it is here                     |
| `CHANGED`           | Edited here since it was last sent                   |
| `COVER TO SEND`     | Only its cover is new; it follows on its own         |
| `WAITING TO SEND`   | A send that couldn't reach the website               |
| `CAN'T GO ON`       | The website can't show it as it is; the row says why |
| `SENDS WITH UPDATE` | Picked to send, and goes when Update is pressed      |

## What the website can't take

A release reads **CAN'T GO ON**, and stays off the website, until it is fixed in
DISCOGRAPHY. The row says which of these it is:

- It has no title, or no track: the website shows a release by its tracks.
- A single or a remix holds anything but exactly one track.
- It has more than 60 tracks.
- Its title, its subtitle, its label or a track's title is over 120
  characters, or its artist line over 200.

## Shown or hidden

Whether visitors see a release follows its status in DISCOGRAPHY:

- **DRAFT**: hidden until its release day. The row says **Hidden · draft**.
- **SCHEDULED**: shown before its day, with its pre-save links.
- **RELEASED**: shown. A release turns RELEASED on its day by itself.

A release can also be hidden by hand, whatever its status: its row says
**Hidden**. One not sent yet says **Not on the website**.

**Show** on a release here that isn't out yet makes it SCHEDULED (it needs a
date); **Hide** makes it a DRAFT. That new status is set in DISCOGRAPHY when
Update is pressed. On a release that's out, Hide keeps it off the website by
hand and Show puts it back; its status does not change.

## Pick, then Update

Nothing on this page reaches the website on its own. Tick releases, or the box
at the start of the bar above the list for every one the filter shows, and
pick what to do from the bar: **Show**, **Hide**, **Add to shelf**, **Remove
from shelf**, **Send**. **More** picks for you: **Pick every release shown**,
**Pick the drafts**, **Pick the hidden ones**, **Pick what's to send**, or
**Pick none**. Each row also has a **⋯** menu for itself alone, with **Open on
the website** for one visitors can see.

What's picked is held, and each row's tags read `NOW → AFTER` with a gold mark
down its edge: `DRAFT → SCHEDULED`, `Hidden · draft → Shown`, `Off shelf →
Shelf · 1`. Hover a moving tag and it says **Changes with Update**. The
**Update** bar at the foot of the page says how many changes there are and of
what kind (`Show 2 · Hide 1 · Shelf`), and sends them all in one request;
**Discard** drops them.

Picks are held while the console runs, even if you leave the page. Signing out,
or changing the website address in REGULATION, drops them.

### How to show or hide releases

1. Tick the releases, or use **More** → **Pick the drafts** or **Pick the hidden
   ones**.
2. Press **Show** or **Hide** on the bar. The rows' tags show what will change.
3. Press **Update**.

To announce a release before its day: give it a release date in DISCOGRAPHY,
then **Show** it here and press **Update**. It becomes SCHEDULED, and the
website shows it with its pre-save links. **Hide** takes the announcement back,
making it a DRAFT again.

### How to send a release by hand

1. Tick it, or use **More** → **Pick what's to send**.
2. Press **Send**. Its chip reads **SENDS WITH UPDATE**.
3. Press **Update**.

**Sync now** does the same for everything new, changed or waiting, without
picking. Its count says how many are waiting.

### When a pick leaves some out

A pick that can't apply to a release leaves that release out, and a notice says
which and why:

| It says                                                                | Because                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `It needs a release date before it can be scheduled.`                  | Show, on a release here with no date                                     |
| `A draft from the other computer: only that computer can schedule it.` | Show, on the other computer's draft                                      |
| `It isn't on the website yet: send it first.`                          | Show or Hide on a release that's out, or Add to shelf, before it is sent |
| `Hidden releases can't go on the shelf.`                               | Add to shelf, on a hidden release                                        |
| `The shelf holds 8.`                                                   | Add to shelf, with the shelf full                                        |
| `The website already has it as it is.`                                 | Send, on one that is ON THE WEBSITE                                      |
| `Sent from the other computer, so it's sent from there.`               | Send, on the other computer's                                            |

If the website refuses an Update, nothing on the website changes and the picks
stay, to try again. **The website changed since it was last fetched. Check for
new, then try again.** means the other computer took something off first:
press **Check for new**, then **Update**.

## The home page shelf

Up to eight releases, in the order set in its panel. With none picked, the
website shows the newest eight. Only a release visitors see can go on it, and
hiding one takes it off.

### How to fill the shelf

1. Tick releases that are shown and press **Add to shelf**. They join the end
   of the shelf.
2. In **HOME PAGE SHELF**, **↑** and **↓** move a release, and **×** takes it
   off. The panel's count reads `changes with Update` while anything is held.
3. Press **Update**.

## Covers and tapes

![releases-02-covers.png](releases-02-covers.png)

Each release's cover goes to the website after the release itself, shrunk here
to 750 pixels on its shorter side, without loss. The website makes it a
750×750 WebP and, from it, the release's tape for the shelf: the cassette with
the cover printed on its insert. A release with no cover shows the
placeholder cover and tape.

- A cover changed in DISCOGRAPHY goes again; the row reads **COVER TO SEND**
  until it has.
- A cover removed in DISCOGRAPHY puts the website back on the placeholder.
- A release removed takes its cover and tape with it.

Covers go one at a time in the background, after any send, so an Update waits
for one cover at most. A cover that can't go, because the console can't read
the file or the website can't store covers yet, waits for the next round.

## What it's doing

While anything is going to the website, a strip under the filters says what:

| It reads                  | While                                                   |
| ------------------------- | ------------------------------------------------------- |
| **Publishing everything** | The first publish goes, in one request                  |
| **Updating the website**  | An Update goes, with how many changes                   |
| **Syncing**               | Sync now fetches the website, then sends what's waiting |
| **Sending an edit**       | A release done with in DISCOGRAPHY goes, by its title   |
| **Sending covers**        | The covers go, with how many have gone and a bar        |

## The other computer's

Releases on the website that the other copy of the console sent are listed
under **From the other computer**. They can be shown, hidden and put on the
shelf here; they're edited and sent there. A draft from there can only be
scheduled there.

> Both copies keep their own DISCOGRAPHY. In practice one computer publishes
> and the other edits only when asked.

## When the website can't be reached

What was last fetched stays on the page, and edits wait to be sent. The status
at the top right says what went wrong, as on CONTACT. One more is particular to
this department: when it says the website **does not know this request yet.
Restart or update it, then try again.**, the website is older than this
console, and needs updating before it can take releases.

## Which website

As with CONTACT: the installed console sends to the live website, and a
development copy to the development server on the same machine. REGULATION →
INTEGRATIONS → **Website address** overrides both. What has been sent is kept
apart for each website, and a website never published to starts from
**Publish everything**.
