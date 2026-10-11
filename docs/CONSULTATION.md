# CONSULTATION: a track shared for other producers' feedback

How a track gets from this console to another producer and back, and how it
is deleted. Added 2026-10-10; moved from Firebase Storage to the website's
Vercel Blob store on 2026-10-11, since Firebase Storage needs the Blaze plan.
Read this before touching `services/consultation/`, `src/shared/consult/`,
the website's `src/lib/consult/`, `/api/haven/consultations` or
`/api/cron/consultations`, or the transport's insert slot in
`features/auditorium/lib/useAudioEngine.ts`.

## The flow

1. Candy presses **Share a track…** in CONSULTATION and chooses a bounce from
   this machine, with the file picker or by dropping it on the dialog. It need
   not be in the ARCHIVE. The dialog asks main whether it can be shared
   (`consultation:check`: an audio format, 200 MB at most, room left), then
   reads and decodes it with AUDITORIUM's survey for its length and its
   waveform, compacted to 2,400 columns (about 10 KB of base64). If the file
   sits in an ARCHIVE project's folder, the project's tempo fills in the BPM.
2. **Share** asks the website for a pass (`POST /api/haven/consultations/upload`
   with the type and size). The website checks there's room, and answers with
   a name in its store, `consultation/<uuid>.<ext>`, and a token that lets
   exactly that file, of that type, in for an hour. Main uploads the track
   straight to the store with Vercel's own SDK, showing the progress, then
   opens the link: `POST /api/haven/consultations` with the title, the
   message, the length, the BPM, the days (1 to 7), the track's address and
   the waveform. The website measures the track in the store first, and
   deletes it instead of opening a link if it is over 200 MB or doesn't fit
   after all. It answers with the record and the page's address,
   `https://candy-heist.vercel.app/consult/<token>`. If the link can't be
   opened, main asks the website to delete the upload (`/discard`).
3. Candy sends the link to a producer. The producer types a name (no
   account), plays the track with its waveform and a live spectrum, leaves
   notes at a moment or over a section, lays a chain of devices on a section
   or on the whole track (EQs, stereo width, a compressor or limiter, each
   switched on or off, in the order they drag them in), watches the meters
   under the waveform (loudness in LUFS, a scope, a stereo imager), hears it
   A/B, and sends it. A Server Action files it.
4. The console checks in with the website, as the inbox does, and keeps a copy
   of every link and of the feedback on the open ones in the archive.
5. CONSULTATION lists each link's producers. Each opens its own page, laid
   out like the website's: the waveform with the same meters and their notes
   under it on the left; their chain on the right, a strip of devices in the
   order they're heard with the one picked shown below, held beside it and
   scrolling on their own. The track plays through their tools on the
   console's one transport: **As it is** and **Their settings** are the A/B.
   Each device switches off and on, to hear the track without it, and the one
   shown folds to a line.
6. When the link closes (its days run out, or **End now**), its page stops
   answering, and the website deletes the track and all its feedback. The
   record stays, as the track's name marked EXPIRED, until **Remove** forgets
   it.

```
console ─(Bearer token)─▶ /api/haven/consultations/upload ─▶ the pass
console ─(the pass)─────▶ Vercel Blob, public store: consultation/<uuid>.<ext>
console ─(Bearer token)─▶ /api/haven/consultations ─▶ Atlas
                                  consultations          the record (no TTL)
                                  consultation_access    token, address, waveform (TTL)
                                  consultation_feedback  notes and tools (TTL)
producer ─▶ /consult/<token> ─(Server Action)─┘ ; plays the track from Blob
website ─▶ deletes tracks: end, remove, sweep, and the daily cron
```

## One engine, both sides

What a producer's feedback is, the check it passes, and the Web Audio graph
it is heard through are written once, in the website, and copied here:

| Website (the master)      | Here                        | Holds                                                         |
| ------------------------- | --------------------------- | ------------------------------------------------------------- |
| `src/lib/consult/engine/` | `src/shared/consult/engine` | The types, the zod check, section timing, the EQ scale        |
| `src/lib/consult/audio/`  | `src/shared/consult/audio`  | The graph, the filters, the EQ curve, the meters, the drawing |

`npm run sync:consult` copies them; `npm run sync:consult -- --check` fails if
the copy is out of date. **Edit the website's copy**, as with the planets. The
copy is left out of this repo's lint and format, and the audio half out of
`tsconfig.node.json` (it needs the DOM).

Because the graph is the same code, what Candy hears here is what the producer
heard: the same devices in the same order, the same filters (a 24 dB cut is a
Butterworth pair), the same mid/side width, and the same
`DynamicsCompressorNode` with makeup gain. The compressor and limiter are a
guide to what the producer means, not a mastering-grade processor; the
CATECHISM chapter says so.

The meters (`audio/meters.ts`) are the same code too. Loudness is measured as
ITU-R BS.1770 does: the standard's own K-weighting, as IIR filters worked out
for the context's sample rate, 400 ms momentary, 3 s short-term, and an
integrated reading gated at −70 LUFS and −10 LU. They're plain nodes, no
AudioWorklet, which this console's page couldn't load from a blob. Here they
hang off the transport's analyser, after the Level fader, so the readings put
the fader back.

A chain stored before devices (`{ eq, saturation, sidechain, width, dynamics
}`) is read through `upgradeChain` by the chain's own schema: its EQ, width
and dynamics come over as devices, and saturation and the sidechain, which
nothing plays any more, are left behind.

## The transport's insert slot

DISCOGRAPHY's rule (D14) is that there is one player. So CONSULTATION does
not have one: it opens the track on the console's transport with
`openFrom(read, { home: 'consultation', key })` and puts a producer's tools in
its one insert slot, `setInsert({ key, label, tools, path })`, between the
source and the analyser. `setBypass(on)` is the A/B. Opening any other file
takes the tools off, so AUDITORIUM never inherits someone's EQ.

A producer's page is `/consultation?link=<id>&producer=<id>`, which is also the
insert's `path`: the transport bar's way back goes to it. Switching a device
there calls `retune(tools)` with their tools and that switch flipped
(`heardTools` in `lib/track.ts`). Unlike `setInsert`, it leaves the A/B where
it is. What they sent is not changed, and opening another producer has theirs
as they left them.

The track comes from `consultation:audio`: the file it was shared from, when it
is still where it was and the same size, and otherwise the copy in the store,
fetched by main from its public address. A track that is only in the store has
no path here, so the bar hides POP OUT and AUDITORIUM hides Reveal for it.
While someone's tools are on, the bar shows whose, and pressing it is the A/B
from any page.

## The store

The tracks are kept in the website's Vercel Blob store, a **public** one, so
the producer's page plays a track straight from Vercel's network. A track's
address carries a random id, so nobody finds one without its link, the same
model the producer's page itself has. The live site keeps its tracks under
`consultation/`, every other copy of the website (this machine's development
server, a preview) under `consultation-dev/`, so a test never touches, and is
never cleared away as, a live track.

**This console holds no key to the store.** It only ever holds a pass: a
client token from Vercel's `generateClientTokenFromReadWriteToken`, made by
the website after the sign-in check, which lets one named file, of one type,
in within the hour. Nothing it holds can delete from the store. The website
holds the store's read-write token, `BLOB_READ_WRITE_TOKEN`, which Vercel adds
when the store is connected to the project.

The pass names the file's size as well, but Vercel doesn't hold an upload sent
in pieces to it: the first test against the real store kept a file bigger
than its pass allowed. So the size the website keeps is the store's own, read
with `head` before the link opens, and a track over 200 MB or past the room
left is deleted there. The room check before the pass is the early refusal;
this one is the count that holds.

The producer's page plays the track through Web Audio, which a browser only
allows across origins when the response carries `Access-Control-Allow-Origin`.
Vercel's public Blob addresses send `*`, on the whole file and on the pieces
(206) a player seeks with; checked against the real store on 11 October 2026.
To check it again:

```
curl -sI -H "Origin: https://candy-heist.vercel.app" <the track's address> | grep -i access-control
```

## The website's side

- `consultations` keeps the record: title, message, length, BPM, the track's
  name, address, size and type, who shared it and when, `expiresAt`,
  `endedAt` and `audioDeletedAt`. No TTL: it is the tombstone, and what the
  website deletes a track by.
- `consultation_access` holds the token (32 random bytes, base64url), the
  track's address and the waveform. TTL on `expireAt`, the link's close.
- `consultation_feedback` holds each submission: the name, the notes, the
  tools, when. TTL on `expireAt`, the link's close.
- The store decides openness from the dates every time, not from the TTL,
  which can lag a minute: a closed link reads closed at once.
- Moving a link's close moves `expireAt` on its access and feedback too. A
  link closes a week from when it was shared at the latest, can't be moved
  into the past, and can't be reopened.
- The page, `src/app/(share)/consult/[token]/page.tsx`, is `noindex` and not
  in the sitemap. A closed or unknown token shows one "This link has closed"
  page.
- Submitting is a Server Action with the contact form's guards: a hidden
  field, a minimum fill time, 10 an hour per visitor, the engine's schema
  checked against the track's length, and the link still open. There is no
  public read of feedback anywhere: only `/api/haven/consultations/feedback`,
  behind the sign-in, hands it over. Producers never see each other's.

| Call                                        | Does                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| `GET /api/haven/consultations`              | Every record, newest first, open ones with link and waveform; `storage` |
| `POST /api/haven/consultations/upload`      | The pass for one upload, or 409 `no_store` / `no_room` with a sentence  |
| `POST /api/haven/consultations`             | Opens a link for an uploaded track                                      |
| `POST /api/haven/consultations/discard`     | Deletes an upload no link plays                                         |
| `PATCH /api/haven/consultations/<id>`       | `{ expiresAt }` moves the close                                         |
| `POST /api/haven/consultations/<id>/end`    | Closes it now, deleting its access, feedback and track                  |
| `DELETE /api/haven/consultations/<id>`      | Forgets it, record and track and all                                    |
| `POST /api/haven/consultations/sweep`       | Deletes closed links' tracks now; answers with the list                 |
| `GET /api/haven/consultations/feedback`     | Feedback on open links since `?since=`, 200 a page                      |
| `GET /api/cron/consultations` (Vercel Cron) | The daily sweep, abandoned uploads included; needs `CRON_SECRET`        |

## This console's side

`services/consultation/`:

- `blob.upload.ts`: the upload, with Vercel's SDK (`put` with the pass,
  `multipart: true`): in pieces, several at once, retrying a piece that fails,
  reporting progress, cancellable. The file goes as a file-backed Blob
  (`fs.openAsBlob`), so it is never read whole. Vercel's errors become plain
  sentences: a paused store, an expired pass, a refused one, the network.
- `consultation.client.ts`: the website's API, through `callWebsite`.
- `consultation.repository.ts`: the copy, in `consultations` and
  `consultation_feedback`, and the feedback cursor in `sync_state` under
  `<website> consultation feedback`. Every read filters on the website, as the
  inbox's do.
- `consultation.service.ts`: the check-ins, sharing, moving, ending, removing,
  and the track's sound.

**Asked, not polled**, as the inbox is: a check-in at startup, on signing in,
on a new website address, and on **Check for new**. The one thing that runs by
itself is a link closing while the console is open: a timer set for the next
close runs a check-in a few seconds after it, which has the website delete the
track then.

A check-in lays the website's list over the copy (dropping what the website no
longer lists), deletes the copy's feedback for links that have closed, and
pulls the feedback sent since the cursor. If the list shows a closed link whose
track is still in the store, it asks the website to sweep, and lays the answer
over the copy. Either copy can move a close, so this copy's dates may be out of
date: a link's feedback is only dropped from the copy straight after the
website has said the link is closed, and reads hide it by this copy's dates in
the meantime.

Mutations that read the website's list and write the copy run one at a time,
so a check-in that listed the links just before a share can't lay that older
list over the copy after it and drop the link just opened.

IPC: `consultation:state`, `:sync`, `:list`, `:feedback`, `:read` (marks a
link's feedback read), `:check`, `:share`, `:cancel-share`, `:expiry`, `:end`,
`:remove`, `:audio`; pushes `consultation:state` and `consultation:progress`.
A clicked notice reuses `inbox:open`.

## When things are deleted

| What                              | Deleted by                                                         | When                                         |
| --------------------------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| The page's way in                 | The website's TTL index; the store refuses it at once by its dates | At the close                                 |
| The feedback, on the site         | The website's TTL index                                            | At the close, within about a minute          |
| The feedback, in this copy        | The first check-in after the close that reaches the website        | Hidden from the moment of close              |
| The track                         | The website, asked by whichever copy of the console is open        | At the close, if a copy is open              |
| The track, whatever happens       | The website's daily sweep (Vercel Cron)                            | Within a day of the close                    |
| An upload whose link never opened | `/discard` at once, else the daily sweep                           | The first daily sweep it is six hours old at |
| The record                        | **Remove**, in CONSULTATION                                        | Never by itself                              |

**End now** closes the link at once: the website deletes its access, its
feedback and its track in the same call. A deleted track's address stops
answering within a minute, once Vercel's network lets go of it.

Feedback nobody checked for before a link closed is gone for good. The rail
counts unread feedback, and the startup notice says when a link with unread
feedback closes within a day.

## The storage meter

The meter is the sum of the sizes of the tracks not yet deleted, by the
website's records, so it counts what either copy of the console shared. It is
measured against the 1 GB of Blob storage Vercel's free plan includes, in the
binary gigabytes the console shows everywhere. A file that would take it past
that is refused when it is chosen, by this copy's count, and again by the
website before it gives the pass, by its own.

Vercel counts storage as a month's average, and this holds to the gigabyte at
every moment, so no month can go over it. What the meter doesn't count: a
development copy's uploads, which go to the same store under
`consultation-dev/` and are recorded on the development website, so only the
development meter shows them.

## One-time setup

Done once, in the website's Vercel project. No card, and nothing in Firebase.

1. **The store.** In the project, open **Storage**, choose **Create Storage →
   Blob**, set the access to **Public**, and connect it to Production, Preview
   and Development. Vercel adds `BLOB_READ_WRITE_TOKEN` to the project's
   environment by itself.
2. **The daily sweep's secret.** In the project's environment variables, add
   `CRON_SECRET`, any long random string. Vercel Cron sends it to
   `/api/cron/consultations`, set in the website's `vercel.json` for 04:00 UTC
   every day (the free plan allows once a day, give or take an hour).
3. **Development.** Run `vercel env pull` in the website, or copy
   `BLOB_READ_WRITE_TOKEN` into its `.env.local`, so the development server
   can give passes and delete tracks too.
4. **The website.** Deploy it with `/consult`, `/api/haven/consultations` and
   the cron route. Until it is deployed, the installed console reports that
   the website does not know the request yet.

This assumes the Vercel project is on the free Hobby plan. On Pro, Blob would
be billed against Pro's monthly credit instead.

## The free plan, and what it means

Vercel's Hobby plan includes, each month: 1 GB of Blob storage, 10 GB of
downloads, 10,000 simple operations (a download that isn't in Vercel's cache)
and 2,000 advanced ones (an upload is a few, one per piece). **It never
charges.** Past any of them, Vercel pauses the store for 30 days instead:
tracks can't be shared or played until then, and the share dialog says so.

The 10 GB of downloads is the one to watch: a producer playing a track is a
download, so a 60 MB WAV can be played about 160 times a month, and a 10 MB
MP3 about a thousand. A link sent to a few producers is far inside it; a link
posted publicly is not what this is for. The figures are Vercel's, from
`vercel.com/docs/vercel-blob/usage-and-pricing`, as of October 2026.

## Limits

- One track a link, 200 MB at most: refused before upload, with the hint to
  bounce at 16-bit or as a 320 kbps MP3.
- 1 to 7 days, counted from when it was shared.
- A submission holds 60 notes and 12 sections with tools; a chain holds 8
  devices, and an EQ 8 points; a note is 1,000 characters.
- 10 submissions an hour per visitor. A producer can send more than once;
  each is kept separately.

## Failures, as the page states them

| It says                                               | Means, and what to do                                                        |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| **NO STORE** across the page                          | The website has no Blob store yet: setup step 1                              |
| `That track is … and a link plays 200 MB at most.`    | Bounce it smaller                                                            |
| `There isn't room for this track…`                    | End a link no longer needed (its track is deleted at once), or share smaller |
| Either of those after the upload                      | The file changed while it uploaded; the website deleted it. Share it again   |
| `The track isn't in the store…`                       | The upload never landed: share it again                                      |
| `Vercel has paused the tracks…`                       | A month's free allowance ran out; it comes back 30 days after, unbilled      |
| `The upload took longer than its hour.`               | Share it again: each share gets a fresh pass                                 |
| `… does not know this request yet.`                   | The website isn't deployed with CONSULTATION yet: setup step 4               |
| The producer's page plays nothing, or the tools don't | The store isn't sending CORS: check with the `curl` above                    |
