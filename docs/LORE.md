# LORE: the lore of Nayara, written here and published to the website

The chapters of the lore and the planets they are read beside: written in this
console, kept in its archive, and published to the website one chapter at a
time. Added 2026-10-02. Read this before touching `services/lore/`,
`shared/domain/lore*.ts`, `features/lore/`, `shared/planets/`, or the website's
`/api/haven/lore/*`.

## The flow

1. The operator writes a chapter in LORE and files it (the unsaved-changes
   bar). It is saved in this machine's archive and nowhere else:
   `lore_chapters` holds the drafts, `lore_planets` the planet library and
   `lore_order` the order. Saving works offline. The other copy of the console
   never sees a draft.
2. **Publish** sends that one chapter to the website, whole
   (`PUT /api/haven/lore/chapters/<id>`): its address, title, line and
   markdown, and a copy of its planet (`{ id, name, spec }`). The website keeps
   it in `lore_published` and rebuilds the lore pages.
3. The website's `/lore` pages read only `lore_published`, and `lore_meta` for
   whether the site has switched over, cached until the next publish.
4. LORE fetches what is published when the page opens and on **Check for new**
   (`GET /api/haven/lore`), and keeps a copy in `lore_cache`, one document per
   website, so the page opens offline. That is how each writer sees what the
   other has published.

```
LORE page ─▶ LoreService ─▶ archive: lore_chapters, lore_planets, lore_order,
                │                    lore_cache (what's published, per website)
                │
                └─(Bearer Firebase ID token)─▶ /api/haven/lore/* ─▶ Atlas: lore_published, lore_meta
                                                                        ▲
                                          website /lore pages ──────────┘ (cached, refreshed on publish)
```

## Decisions (the operator's, 2026-10-02)

- **Drafts stay on this PC until they are published.** LORE was first built
  with shared drafts in Atlas and changed the same day: saving must not leave
  the PC, and only Publish reaches the website. Accepted with it: the other
  writer cannot see or continue an unpublished draft, and a draft lives on one
  PC.
- **Chapter by chapter.** Publish, Unpublish, Delete everywhere, and Publish
  order when the website's order differs. There is no "publish all".
- **Haven replaces the files at once.** The website reads its markdown files
  (`src/content/lore/chapters`) until the first publish sets `lore_meta.live`;
  from then on it shows only what is published, even when that is one chapter.
- **Starts empty.** The eleven chapters in the website's files were not
  imported.
- **The whole department is behind the DISPATCH sign-in**, the drafts here
  included.
- **The planet generator** is layer based, with presets and shuffle, and fully
  customisable: 26 layer types, any of them repeated, up to 24 layers, motion
  per layer as the operator chooses, the brand swatches plus any colour, and
  parts beyond the circle (the website draws such a planet smaller to fit).
  Renders, images laid over the surface, are left out for now; the renderer
  keeps a slot for them.

## What a chapter's status means

Worked out, not stored (`chapterStatus` in `shared/domain/lore.ts`): the draft
here against the published copy.

| Status      | When                                                                                                |
| ----------- | --------------------------------------------------------------------------------------------------- |
| `draft`     | Not published                                                                                       |
| `published` | Published, and either no draft here or one whose address, title, line, text and planet's look match |
| `changed`   | Published, and any of those differs here. The planet's name does not count                          |

A planet edited in the library makes every chapter drawn with it `changed`,
because the website keeps the copy each was published with.

## Two writers, and clashes

Each published chapter carries a `revision` that goes up on every publish. A
draft remembers, per website (`bases`), the revision it started from: set when
a published chapter is first filed here, and after each publish from here, and
cleared when it is unpublished from here. Publishing sends it as
`baseRevision`.

- The website refuses a publish whose `baseRevision` is not the current
  revision (409 `conflict`, with `current`: their version), unless `force` is
  set.
- A chapter taken down after the draft started from it (a base above 0, and not
  on the website) is refused the same way, with `current: null`.
- LORE asks: publish over theirs (`force`), take theirs (delete the draft here,
  so the published version shows: `deleteChapter` with `everywhere: false`), or
  cancel.

Bases are per website because a development server is another website, with
its own revisions. The drafts themselves are the same whichever website is set
in REGULATION.

## The order

`lore_order` is one document listing chapter ids, drafts and published alike.
`displayOrder` adds anything published but not placed (in the website's order)
and any draft not placed (oldest first). Moving is local. **Publish order**
sends the published ids in this order (`PUT /api/haven/lore/order`); the
website refuses a list that is not exactly what it has published (409
`out_of_date`), and LORE fetches again.

On a fetch, when nothing moved here is waiting to be published, the order here
follows the website's (`withSiteOrder`: the published chapters' places are
refilled in the website's order, and drafts stay where they are), so the other
writer's **Publish order** arrives. With a move waiting, the list says the
orders differ and offers both ways out. A newly published chapter goes last on
the website.

## The website's API

Every call needs the bearer token (the same check as the inbox, see
`docs/INBOX.md`) and answers `Cache-Control: no-store`, with what is published:
`{ live, chapters: [{ id, slug, title, line, body, planetId, planetName, planet, order, revision, publishedAt, publishedBy }] }`.

| Call                                   | Does                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `GET /api/haven/lore`                  | What is published, in its order                                                       |
| `PUT /api/haven/lore/chapters/<id>`    | Publishes a chapter, new or again. 400 with a message; 409 `conflict` or `slug_taken` |
| `DELETE /api/haven/lore/chapters/<id>` | Takes it off the website                                                              |
| `PUT /api/haven/lore/order`            | `{ ids }`: the published chapters' order. 409 `out_of_date`                           |

The chapter id is made here when the chapter is created (an ObjectId, in hex),
and the website keys the published copy by it. The website checks the markdown
with its own reader, and the address against the other published chapters,
before it keeps anything. A published chapter keeps its address: a publish that
changes it is refused.

## The planet engine is the website's, copied

`src/shared/planets/engine` (the spec, the 26 layer types, the presets, the
drawing) and `src/shared/planets/react` (`PlanetSvg`) are copies of the
website's `src/lib/planets`, and `src/renderer/src/lib/markdown/blocks.ts` is a
copy of its lore markdown reader. The preview here and the page there are drawn
by the same code.

- Edit them in the website, then run `npm run sync:planets` here. It reads
  `../candy-heist`, or `CANDY_HEIST_DIR`. With `--check`
  (`node scripts/sync-planets.mjs --check`) it reports drift and changes
  nothing.
- The copies are left out of ESLint and Prettier here, and `react/` out of the
  main process's typecheck.

## Files

- `src/shared/domain/lore.ts`, `lore.constants.ts`: the schemas, the limits
  (the website's, word for word), and the pure helpers both processes use
  (`chapterViews`, `chapterStatus`, `displayOrder`, `orderDiffers`,
  `withSiteOrder`, `planetLook`, `baseFor`).
- `src/main/services/lore/`: `lore.service.ts` (everything above),
  `lore.repository.ts` (the four collections), `lore.client.ts` (the website).
- `src/renderer/src/features/lore/`: `LorePage` and its three tabs, CHAPTERS,
  WRITE and PLANETS (`?tab=`); `chapters/` (the list, the WRITE tab and its
  editor with its three views, the preview, and the formatting bar:
  `markdownEdits.ts` holds its edits as pure functions, and
  `useMarkdownEditing.ts` applies them through `insertText`, so the browser's
  own undo takes them back); `planets/` (the library, the editor, the layer
  settings in folding sections, the planet's own settings, adding a layer, and
  `edit.ts`, the pure changes behind every button); `components/`; `lib/`
  (order and dragging, the window-storage backup, formatting).
- The website: `src/lib/lore/` (model, store, published, revalidate),
  `src/app/api/haven/lore/`, and `src/content/lore/getLore.ts`.
