# CONSULTATION

A track shared for other producers' feedback, and their notes heard back.
Behind the DISPATCH sign-in.

![consultation-01-page.png](consultation-01-page.png)

## What it is for

You share a track you are still working on, and get a link on the website to
send to another producer. They open it, type their name, and listen. They can
leave a note at a moment ("the snare's too loud here"), mark out a section and
leave a note on it, and try tools on a section or on the whole track: an EQ
with points they add and remove, a compressor or a limiter, sidechain pumping,
stereo width and saturation. Then they send it.

Their feedback comes back here. You read their notes pinned on the waveform,
read their settings in words and as the EQ's curve, and **hear the track
through their settings**, switching between that and the track as it is.

A link is open for one to seven days. When it closes, the page stops working,
and the track and every piece of feedback are deleted. The link stays here,
under its name, marked **EXPIRED**.

Only the two of you see the feedback. Producers never see each other's.

## Signing in

CONSULTATION uses the DISPATCH sign-in: signing in here signs in there, and on
CONTACT, SERVICES, LORE and RELEASES too. Until someone signs in, nothing is
fetched or shown.

## How to share a track

1. Press **Share a track…**.
2. Press **Choose a file…** and pick the bounce, or drop the file onto the
   dialog. Any audio file on this computer will do; it does not have to be in
   the ARCHIVE. A file over 200 MB, or one there is no room left for, is
   refused at once, and the dialog says why.
3. Check the **Title**. It starts as the file's name; the page shows it above
   the track.
4. Check the **Tempo**. If the file sits in an ARCHIVE project's folder, it is
   that project's tempo, and the hint says which project. It lets their
   sidechain land on the beat; leave it empty if you don't know it.
5. Choose how long the link is open: **1 DAY** to **7 DAYS**. The hint says
   when it will close.
6. Under **What to listen for**, say what you want to know, if anything. It is
   shown above the track.
7. Press **Share**. The bar shows the upload; then the link is opened.
8. Press **Copy link**, and send it to whoever should hear it.

**Cancel**, or Escape, during the upload stops it. Once the bar says **Opening
the link**, it is too late to stop.

![consultation-02-share.png](consultation-02-share.png)

## The page

| Part                 | What it is                                                                |
| -------------------- | ------------------------------------------------------------------------- |
| **STORAGE**          | How much of the free 5 GB the shared tracks take, and how much is free    |
| **Share a track…**   | Shares one. Reads **Connect to share** while the website can't be reached |
| **Check for new**    | Asks the website for new feedback                                         |
| **01 SHARED**        | Every track shared, newest first, open and expired                        |
| **02** and the title | The one picked: its link, when it closes, and the feedback on it          |

Each track in the list says how many responses it has, when it closes, and
whether it is **OPEN** or **EXPIRED**. A **NEW** mark counts feedback you
haven't opened. On its last day, **closes in** turns crimson: whatever isn't
read by then is gone.

## How to read and hear the feedback

1. Press **Check for new**, so anything sent since the last check is in.
2. Pick the track in **SHARED**. Its feedback opens beside it, and stops
   counting as new.
3. Pick a producer along the top. Their moments are pins on the waveform and
   their sections are bands, and their notes are listed in order underneath,
   each with the tools on it in words, and its EQ drawn as a curve.
4. Press **Play**, or press the waveform, or a note, to play from there. The
   track plays through their settings: each section's tools switch in where
   the section starts and out where it ends, and the tools on the whole track
   are on all the way through.
5. Press **As it is** to hear the track without their settings, and **their
   name's settings** to hear it with them again. That is the A/B.

![consultation-03-feedback.png](consultation-03-feedback.png)

It plays on the console's transport, at the foot of the window, so it keeps
playing while you go to another page. While their settings are on, the bar
shows their name; press it to switch between their settings and the track as
it is from anywhere. Opening any other file takes their settings off.

The track comes from the file it was shared from, if it is still where it was,
and otherwise from the copy kept for the link. A link shared from the other
computer always plays from the copy.

> The compressor and limiter are a guide to what the producer means, not a
> mastering-grade processor. Read their settings as directions, and try them on
> your own chain.

## How to change when a link closes

Under **Open for**, pick another day: up to seven days from when it was
shared. A day already gone is greyed out.

**End now** closes it straight away, after asking. The page stops working, and
the track and its feedback are deleted at once.

A closed link can't be reopened, because its feedback is gone. Share the track
again for more.

## How to remove an expired link

Pick it, press **Remove**, and **Remove** again to confirm. It goes from here,
from the other computer, and from the website. It needs the website, so while
the console can't reach it the button reads **Connect to remove**.

## When it closes

When a link closes, its page says the link has closed. The track and all its
feedback are deleted: by the console the moment the link closes, if it is
open, or the next time it starts. If neither computer opens the console again,
the track is deleted by Firebase itself, eight days after it was shared.

**Feedback nobody checked for before the link closed is gone for good.** So:

- The rail counts new feedback beside CONSULTATION.
- When the console starts, one Windows notification, **Feedback waiting**,
  says who sent feedback, and when a link with unread feedback closes within a
  day. Clicking it opens CONSULTATION.

## The storage meter

Firebase keeps 5 GB of tracks for free. The meter counts every track not
deleted yet, shared from either computer. Sharing refuses a track that would go
past 5 GB, and says how much is left. **End now** on a link you are done with
deletes its track at once and gives the room back.

Listening counts too, separately: about 100 GB of plays a month are free, which
is a 60 MB WAV played around 1,600 times.

## When something goes wrong

| It reads                                      | Means, and what to do                                                |
| --------------------------------------------- | -------------------------------------------------------------------- |
| **NO BUCKET** across the page                 | Firebase Storage isn't set up yet. mist has the steps                |
| `Firebase Storage refused this account`       | Storage's rules aren't published yet. mist has the steps             |
| `That track is … a link plays 200 MB at most` | Bounce it at 16-bit, or as a 320 kbps MP3                            |
| `There isn't room for this track`             | End a link you are done with, or share a smaller bounce              |
| `… does not know this request yet`            | The website hasn't been updated with CONSULTATION yet                |
| The producer says the page plays nothing      | Storage isn't set to let the website play it yet. mist has the steps |
