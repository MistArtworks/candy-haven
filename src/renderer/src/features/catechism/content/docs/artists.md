# ARTISTS

The roster: who the practice works with, and what they are on.

![artists-01-roster.png](artists-01-roster.png)

## What an artist record is

One person, with a name, a face, what they do, and where to find them. Records
here are referenced from two places — a project in the ARCHIVE credits them,
and a release in the DISCOGRAPHY bills them — so adding somebody once makes
them available everywhere.

Credits are held as **ids, not names**. Renaming somebody propagates through
every project and every release at once, rather than leaving the old spelling
behind on work filed last year.

## This is not the ARTIST folder

The ARCHIVE's filing tree has an `ARTIST` folder kind, sitting beside `GENRE`
inside a category. It is unrelated to this department, deliberately.

|                      | An ARTIST folder             | An artist record              |
| -------------------- | ---------------------------- | ----------------------------- |
| What it is           | A real directory on disk     | A register entry              |
| What it says         | Where the files live         | Who made the work             |
| How many per project | Exactly one                  | As many as were in the room   |
| Moving a project     | Changes which shelf it is on | Changes nothing about credits |

A collaboration filed under `Collabs / Nasko` can still credit three people,
and dragging it to `Personal / Dubstep` does not rewrite who made it. Tying
the two together would mean a two-artist track needed two folders, which is
not a thing a filesystem does.

## Finding somebody

The bar above the roster is two rows, split by what each is for. The first is
what you _do_ here; the second is what you are _looking at_.

- **Search** matches the name and the real name, so somebody you know by
  their legal name is findable without remembering the alias. The ✕ clears it.
- **◆ Favourites** narrows to what you have marked.
- **Role chips** narrow by what somebody does. They match with **OR** — picking
  VOCALIST and WRITER shows either, because almost nobody is both and
  requiring both would empty the page. (Tags in the ARCHIVE match with AND;
  the two look alike and are asked differently.)
- The count at the end reads `8 of 40` while anything is filtering, so an
  empty page is never confusable with a filter that is too narrow. **Clear**
  appears only when there is something to clear.

## How to add somebody

1. Press **Add an artist**.
2. Type the **name** they are billed by. Add the real name, roles, colour and
   notes now or later; only the name is needed.

   ![artists-02-add.png](artists-02-add.png)

3. Press **Add**. Their record opens, ready for a picture: choose one there.
4. Add their links (Spotify, SoundCloud, socials) under **Edit**.

## How to credit somebody

1. On a project: open its dossier in the ARCHIVE and pick them in the
   **CREDITS** panel on OVERVIEW.
2. On a release: open it in DISCOGRAPHY, press **EDIT**, and name them on
   **CREDITS**, as the main artist, featuring, or in a credit line such as
   `PRODUCED BY`.

Their card then counts what they are on, and their record lists it.

![artists-03-record.png](artists-03-record.png)

## Adding somebody

**Add an artist** opens a dialog. Only the name is required; the real name,
the roles, the colour and the notes are all optional and can be left for
whenever you think of them.

The **picture is not in the dialog**, and that is the one field with a real
reason: a stored picture is filed under the artist's id, and there is no id
until the record exists. So the dialog hands straight over to the sheet on
success, where the picture is the first thing in front of you.

A name that already exists is **returned rather than refused** — you get the
existing record, which is what you meant.

## Opening a record

A card opens as a dossier rather than a form. What are they on, how do I reach
them, what did I write down about them — that is almost always what a click is
asking, and every one of those is a read: credits named rather than counted,
links pressable and opening in your own browser rather than in the console,
notes as prose. **Edit** sits beside it as a door rather than the default.

If nobody on the roster is marked as you, Edit is also where **This is me**
asks. Marking a record answers it once; the roster leads with it after.

## The record

Set from Edit. Everything saves as you stop typing — there is no save button,
and that is deliberate: a roster entry is filled in over time, usually while
doing something else, and a form that has to be committed is one you abandon
half-finished.

| Field          | For                                                                     |
| -------------- | ------------------------------------------------------------------------ |
| **Name**       | How they are billed. What appears on credits                             |
| **Real name**  | For splits and paperwork. Never shown where the alias belongs            |
| **Roles**      | Producer, vocalist, instrumentalist, writer, DJ, engineer, visual, other |
| **Picture**    | Copied into the archive — see below                                      |
| **Links**      | Spotify, SoundCloud, Bandcamp, socials, or anything else                 |
| **Colour**     | Yours to pick. Stored exactly as chosen                                  |
| **Notes**      | How you met, what they play, who to ask                                  |
| **This is me** | Marks your own record, so credits can name you like anybody else         |

### Pictures are copied, not linked

Choosing a picture **copies it** into the archive's own media folder, beside
`Projects` and `Release Mastered Tracks`. The original can then be moved,
renamed or deleted and the roster still draws it.

The record keeps where it came from, so the sheet can still tell you the file
was in your Downloads folder in March long after that folder was emptied.

## Crediting somebody

From the project's side: open its dossier, and the **CREDITS** panel on
OVERVIEW lists the roster. It sits beside TAGS and NOTES because it is the
same kind of thing — your own statement about the work, which no rescan can
overwrite.

From the release's side: DISCOGRAPHY's sheet has **Billed as** and
**Featuring**, which are two different positions on a cover rather than two
kinds of person.

## Removing somebody

Removing an artist strips them from **every project and every release** that
credits them, and the confirmation says how many of each before you commit.
No files are touched — a credit is a record, not a folder.

> The counts on each card — "3 projects · 2 releases" — are what make this a
> register rather than an address book. They answer the question actually
> being asked, which is who you have really worked with.
