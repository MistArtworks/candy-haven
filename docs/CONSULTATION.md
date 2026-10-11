# CONSULTATION: a track shared for other producers' feedback

How a track gets from this console to another producer and back, and how it
is deleted. Added 2026-10-10. Read this before touching
`services/consultation/`, `src/shared/consult/`, the website's
`src/lib/consult/` or `/api/haven/consultations`, or the transport's insert
slot in `features/auditorium/lib/useAudioEngine.ts`.

## The flow

1. Candy presses **Share a track…** in CONSULTATION and chooses a bounce from
   this machine, with the file picker or by dropping it on the dialog. It need
   not be in the ARCHIVE. The dialog asks main whether it can be shared
   (`consultation:check`: an audio format, 200 MB at most, room left), then
   reads and decodes it with AUDITORIUM's survey for its length and its
   waveform, compacted to 2,400 columns (about 10 KB of base64). If the file
   sits in an ARCHIVE project's folder, the project's tempo fills in the BPM.
2. **Share** uploads the track to Firebase Storage, as
   `consultation/<uuid>.<ext>`, on the DISPATCH sign-in, and opens its link on
   the website: `POST /api/haven/consultations` with the title, the message,
   the length, the BPM, the days (1 to 7), the track's address and the
   waveform. The website answers with the record and the page's address,
   `https://candy-heist.vercel.app/consult/<token>`. If the link can't be
   opened, main deletes the upload again.
3. Candy sends the link to a producer. The producer types a name (no
   account), plays the track with its waveform and a live spectrum, leaves
   notes at a moment or over a section, puts tools on a section or on the
   whole track (EQ, compressor or limiter, sidechain pumping, stereo width,
   saturation), hears it A/B, and sends it. A Server Action files it.
4. The console checks in with the website, as the inbox does, and keeps a copy
   of every link and of the feedback on the open ones in the archive.
5. CONSULTATION shows each producer's notes on the waveform, their tools in
   words and as the EQ's curve, and plays the track through their tools on the
   console's one transport: **As it is** and **Their settings** are the A/B.
6. When the link closes (its days run out, or **End now**), its page stops
   answering, and the track and all its feedback are deleted. The record stays,
   as the track's name marked EXPIRED, until **Remove** forgets it.

```
console ──(Firebase ID token)──▶ Firebase Storage: consultation/<uuid>.<ext>
   │                                    ▲  the page plays it by its download
   │                                    │  address (token in the URL, CORS)
   └─(Bearer token)─▶ /api/haven/consultations ─▶ Atlas
                                    consultations          the record (no TTL)
                                    consultation_access    token, address, waveform (TTL)
                                    consultation_feedback  notes and tools (TTL)
producer ─▶ /consult/<token> ─(Server Action)─┘
```

## One engine, both sides

What a producer's feedback is, the check it passes, and the Web Audio graph
it is heard through are written once, in the website, and copied here:

| Website (the master)      | Here                        | Holds                                                           |
| ------------------------- | --------------------------- | --------------------------------------------------------------- |
| `src/lib/consult/engine/` | `src/shared/consult/engine` | The types, the zod check, section and duck timing, the EQ scale |
| `src/lib/consult/audio/`  | `src/shared/consult/audio`  | The graph, the filters, the EQ curve, the canvas drawing        |

`npm run sync:consult` copies them; `npm run sync:consult -- --check` fails if
the copy is out of date. **Edit the website's copy**, as with the planets. The
copy is left out of this repo's lint and format, and the audio half out of
`tsconfig.node.json` (it needs the DOM).

Because the graph is the same code, what Candy hears here is what the producer
heard: the same filters (a 24 dB cut is a Butterworth pair), the same tanh
saturation, ducks scheduled on the same beat from the BPM and offset, the same
mid/side width, and the same `DynamicsCompressorNode` with makeup gain. The
compressor and limiter are a guide to what the producer means, not a
mastering-grade processor; the CATECHISM chapter says so.

## The transport's insert slot

DISCOGRAPHY's rule (D14) is that there is one player. So CONSULTATION does
not have one: it opens the track on the console's transport with
`openFrom(read, { home: 'consultation', key })` and puts a producer's tools in
its one insert slot, `setInsert({ key, label, tools })`, between the source and
the analyser. `setBypass(on)` is the A/B. Opening any other file takes the
tools off, so AUDITORIUM never inherits someone's EQ.

The track comes from `consultation:audio`: the file it was shared from, when it
is still where it was and the same size, and otherwise the copy in the bucket,
fetched by main with the sign-in. A track that is only in the bucket has no
path here, so the bar hides POP OUT and AUDITORIUM hides Reveal for it. While
someone's tools are on, the bar shows whose, and pressing it is the A/B from
any page.

## The website's side

- `consultations` keeps the record: title, message, length, BPM, the track's
  path, size and type, who shared it and when, `expiresAt`, `endedAt` and
  `audioDeletedAt`. No TTL: it is the tombstone.
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

| Call                                     | Does                                                             |
| ---------------------------------------- | ---------------------------------------------------------------- |
| `GET /api/haven/consultations`           | Every record, newest first, open ones with link and waveform     |
| `POST /api/haven/consultations`          | Opens a link for an uploaded track                               |
| `PATCH /api/haven/consultations/<id>`    | `{ expiresAt }` moves the close; `{ audioDeletedAt }` records it |
| `POST /api/haven/consultations/<id>/end` | Closes it now, deleting its access and feedback                  |
| `DELETE /api/haven/consultations/<id>`   | Forgets it, record and all                                       |
| `GET /api/haven/consultations/feedback`  | Feedback on open links since `?since=`, 200 a page               |

## This console's side

`services/consultation/`:

- `storage.client.ts`: Firebase Storage over REST, as Firebase's web SDK
  talks to it (`packages/storage/src/implementation/requests.ts` is the
  specification): `Authorization: Firebase <idToken>`, and the resumable
  upload (`X-Goog-Upload-Protocol: resumable`, then `upload` and
  `upload, finalize` pieces). Pieces start at 1 MiB and are sized to take about
  two seconds each, up to 8 MiB, every one but the last a multiple of 256 KiB.
  A piece whose answer is lost is followed by a `query`, and the upload carries
  on from where the bucket says it got to; four failures in a row give up. The
  track is stored with `Cache-Control: private, max-age=86400`, so a producer
  listening twice in a day doesn't download it twice.
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
close runs a check-in a few seconds after it, so the track is deleted when the
link closes.

A check-in lays the website's list over the copy (dropping what the website no
longer lists), deletes the copy's feedback for links that have closed, pulls
the feedback sent since the cursor, then deletes the tracks of closed links
from the bucket and patches `audioDeletedAt`, so the other copy doesn't try
again. A track is only deleted, and a link's feedback only dropped from the
copy, straight after the website has said the link is closed: either copy can
move a close, so this copy's dates may be out of date. Reads hide a closed
link's feedback by this copy's dates in the meantime.

Mutations that read the website's list and write the copy run one at a time,
so a check-in that listed the links just before a share can't lay that older
list over the copy after it and drop the link just opened.

IPC: `consultation:state`, `:sync`, `:list`, `:feedback`, `:read` (marks a
link's feedback read), `:check`, `:share`, `:cancel-share`, `:expiry`, `:end`,
`:remove`, `:audio`; pushes `consultation:state` and `consultation:progress`.
A clicked notice reuses `inbox:open`.

## When things are deleted

| What                        | Deleted by                                                         | When                                                |
| --------------------------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| The page's way in           | The website's TTL index; the store refuses it at once by its dates | At the close                                        |
| The feedback, on the site   | The website's TTL index                                            | At the close, within about a minute                 |
| The feedback, in this copy  | The first check-in after the close that reaches the website        | Hidden from the moment of close                     |
| The track, in the bucket    | Whichever copy of the console checks in first after the close      | At the close if a copy is open, else next start     |
| The track, whatever happens | The bucket's lifecycle rule (`storage.lifecycle.json`)             | Eight days after upload; Google gives no exact time |
| The record                  | **Remove**, in CONSULTATION                                        | Never by itself                                     |

**End now** closes the link at once: the website deletes its access and
feedback in the same call, and the copy that ended it deletes the track.

Feedback nobody checked for before a link closed is gone for good. The rail
counts unread feedback, and the startup notice says when a link with unread
feedback closes within a day.

## The storage meter

The meter is the sum of the sizes of the tracks not yet deleted, by the
website's records, so it counts what either copy of the console shared. It is
measured against Firebase's free 5 GB, in the binary gigabytes the console
shows everywhere. A file that would take it past that is refused when it is
chosen, by this copy's count, and again when it is shared, by a fresh list.

What it doesn't count: a development copy's uploads go to the same bucket but
are recorded on the development website, so only the development meter shows
them. The lifecycle rule clears them like any other.

## One-time setup

Done once, in the Firebase and Google Cloud consoles. The repository holds the
three files: `storage.rules`, `storage.cors.json` and `storage.lifecycle.json`,
beside `database.rules.json`.

1. **Blaze.** In the Firebase console, move the project to the Blaze plan
   (Usage and billing). Cloud Storage for Firebase needs it since
   3 February 2026; usage within the free tier still costs nothing.
2. **The bucket.** This project's config names
   `candy-haven.firebasestorage.app`, a new-style default bucket. Open Storage
   and press **Get started**, and choose **US-CENTRAL1, US-EAST1 or US-WEST1**:
   the free tier applies only there. (An older project's `<id>.appspot.com`
   bucket keeps its own free level on Blaze.)
3. **Rules.** Storage → Rules: paste `storage.rules` and publish. Only the two
   accounts can write or delete; only audio; only under `consultation/`; 200 MB
   at most.
4. **CORS**, so the website's page may play the track through its tools (Web
   Audio reads the samples, which a browser only allows across origins with
   CORS). In Google Cloud Shell, or with the gcloud CLI signed in to the
   project, from this repository:

   ```
   gcloud storage buckets update gs://candy-haven.firebasestorage.app --cors-file=storage.cors.json
   ```

   It allows the live site and `http://localhost:3000`. When the website moves
   to a bought domain, add it to `origin` and run the command again.

5. **Lifecycle**, the guarantee that a track goes even if no copy of the
   console is opened again:

   ```
   gcloud storage buckets update gs://candy-haven.firebasestorage.app --lifecycle-file=storage.lifecycle.json
   ```

   It deletes anything under `consultation/` eight days after it was uploaded.
   `gcloud storage buckets describe gs://candy-haven.firebasestorage.app` shows
   both settings back.

6. **The config.** If REGULATION → BOARD's config has no `storageBucket`, paste
   it again; CONSULTATION says so when it is missing.
7. **The website.** Deploy the website with `/consult` and
   `/api/haven/consultations`. Until it is deployed, the installed console
   reports that the website does not know the request yet. Nothing new is
   needed in Vercel's settings.

## The free tier, and what it means

On a new-style bucket in one of those three regions, Google's free tier is
5 GB-months of storage, 5,000 Class A and 50,000 Class B operations a month,
and 100 GB of downloads a month (from North America to anywhere but China and
Australia). A download is a producer playing the track: ten producers on a
60 MB WAV is 600 MB, well inside it. Google counts operations by request, and
an upload is a few requests (one per piece), so even a couple of hundred big
shares a month stays inside it. The figures are Google's, from
`cloud.google.com/free/docs/free-cloud-features`, as of October 2026.

## Limits

- One track a link, 200 MB at most: refused before upload, with the hint to
  bounce at 16-bit or as a 320 kbps MP3.
- 1 to 7 days, counted from when it was shared.
- A submission holds 60 notes, 12 sections with tools, and 8 EQ points a set
  of tools; a note is 1,000 characters.
- 10 submissions an hour per visitor. A producer can send more than once;
  each is kept separately.

## Failures, as the page states them

| It says                                                 | Means, and what to do                                                        |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `The Firebase config names no Storage bucket.`          | Set Storage up (above), then paste the config again in REGULATION → BOARD    |
| `Firebase Storage has no bucket called …`               | Storage isn't set up yet: step 2                                             |
| `Firebase Storage refused this account…`                | The rules aren't published, or a UID in them is wrong: step 3                |
| `Firebase Storage needs the project on the Blaze plan.` | Step 1                                                                       |
| `That track is … and a link plays 200 MB at most.`      | Bounce it smaller                                                            |
| `There isn't room for this track…`                      | End a link no longer needed (its track is deleted at once), or share smaller |
| `… does not know this request yet.`                     | The website isn't deployed with CONSULTATION yet: step 7                     |
| The page plays nothing, or the tools do nothing         | CORS isn't set on the bucket: step 4                                         |
| `Its track couldn't be deleted from storage yet.`       | Remove waits until the track is gone, so the meter can't lose count of it    |
