The catalogue can fill itself in from the platforms the music is already on.

## THE SEEDER

A **temporary** department, at DISCOGRAPHY → **SEED FROM THE PLATFORMS**. It
reads your whole released catalogue off Spotify, Apple Music, Deezer, TIDAL,
YouTube and SoundCloud, works out which of them are the same recording, and
proposes a catalogue. It is meant to be run once and then removed from the
application entirely.

Paste the keys — or press **LOAD FROM A FILE** and point it at the `.env.seed`
you were given, which fills all of it including the SoundCloud links — and
press **HARVEST**.

### It shows its working

A window opens and narrates the run: every request it sends, what came back,
and what each step concluded. Not decoration. A harvest is two minutes of
somebody else's computers being asked questions, and you are not waiting for
it — you are deciding whether to trust what comes out, which needs to be
visible. It is also the only way to see why a run went wrong.

### Nothing is written until you say so, twice

When the reading finishes the window becomes **CONTINUE**, and only then does
the proposal appear: every record it would raise, every platform link and how
it was matched, every track with its ISRC, and every judgement call it was not
sure about with the odds it gave. Untick anything you do not want. Overrule any
call. Both rebuild the whole proposal, so what is on screen is always exactly
what writing would do.

Then a second button, and a dialog that restates the totals before it moves.

### It can be taken back

Every run is recorded, and the page offers to reverse it — precisely. The
records it raised are deleted, the links it added to records that already
existed come off, the artists it introduced leave the roster, and **anything
you have done since is untouched.** It survives closing the application, which
is when you usually want it.

If you are happy with a run, **KEEP IT** stops it offering.

### What it is careful about

- **A record is yours only if you are on every track of it.** A release you
  have one track on is somebody else's, however the store bills it — it is
  filed as what it is, credited to whoever put it out, and carries a note
  saying so.
- **SoundCloud decides what is real.** Everything there is also on YouTube and
  not the reverse, so a recording found only on YouTube is a promo, not a
  record. That alone stopped two Shorts becoming releases.
- **An anime music video is the video for its track**, not a release of its own.
- Your catalogue is never trampled. A record already there is added to, never
  replaced, and nothing is ever deleted.

## ARTISTS

The roster is a wall of faces now. The stage name leads at the size it deserves
and the real name sits under it; whoever you are opens first and is marked.

Opening somebody gives you a record to read rather than a form to fill in —
their releases, the projects they are on — with **EDIT** when you actually want
to change something.

## Albums and the singles they are made of

Raising an album lets you pick the singles it collects, there and then, instead
of raising it empty and coming back. A running order collects **recordings** —
singles and remixes — so naming an album as a row is refused rather than
quietly accepted.

Tracks on an EP now also exist as records of their own, and each row points at
its own entry. Open `4x4` and every track has **OPEN …** beside it.

## Finding a song

Searching the catalogue now looks inside running orders. Typing `Menace` used
to find nothing at all, because a track was not a record; it now returns the
record holding it and says `holds "Menace"` so you can see why.

## Naming a master without a project

A track with no ARCHIVE project behind it could not say which file shipped —
which is most of a back catalogue, since there is no project for a record from
2018 and there never will be. **LINK A MASTER** now takes a file from anywhere.
Nothing is copied or moved; it points at the file where it sits.

## THE OBSERVATORY

Cut down to what is actually pressed. The rail is icons and names, the
descriptions are gone, and each overlay's console leads with its one main
control at full width with the helpers underneath. The kind label stays, and
is finally legible.

## The details

- **Increasing Windows text size no longer breaks the startup window.** It
  scales to fit the screen instead of being clipped.
- **Sidebar and rail clicks work again inside an overlay console.** A page's
  shortcuts were re-registering on every render, which pinned the interface
  under a re-render loop.
- **CTRL+R or F5 reloads the page you are standing in** without restarting the
  application.
- Artists the seeder introduces arrive with their photographs. Anyone already
  on your roster keeps the picture you chose.
- A record with no sleeve borrows one from another release carrying the same
  recording.

## Under it

Two pieces were built for the seeder and deliberately kept outside it, because
neither is about music: a facility for asking typed questions and getting
**probabilities** back rather than prose, which is what lets a few hundred
judgement calls become a dozen worth your attention; and the plumbing for
talking to rate-limited services.

That plumbing learned something the hard way. Spotify answers a hard
rate-limit by asking to be left alone for **nineteen hours**, and the first
version obeyed it — which looks exactly like the application having frozen. It
now refuses any wait over two minutes and tells you what happened instead, a
single request gives up after thirty seconds, and **DISCARD** is never disabled,
because the moment you want it is the moment something has gone wrong.

Worth knowing while using the seeder: a full harvest is around 140 requests to
Spotify, and three in an afternoon is enough to be locked out for a day.
