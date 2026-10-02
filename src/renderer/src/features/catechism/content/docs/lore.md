# LORE

The lore of Nayara, written here and published to the website: its chapters,
and the planets they are read beside. Behind the DISPATCH sign-in.

## Written here, published there

Everything written in LORE is kept on this PC, in the archive: the chapters,
the planet library and their order. **File changes** saves it here and nowhere
else, so saving works with the network down, and the other copy of the console
never sees what has not been published.

The website shows a chapter only once it is **published**. Publishing sends that
one chapter as it stands, with a copy of its planet. Until the first chapter is
published, the website reads the lore from its own files; the first publish
switches it over for good, and from then on it shows only what is published
from here. The page says so while the website has not switched yet.

| Status      | Means                                                   |
| ----------- | ------------------------------------------------------- |
| `DRAFT`     | Only on this PC; the website has never had it           |
| `PUBLISHED` | On the website, exactly as it is here                   |
| `CHANGED`   | On the website, but changed here since it was published |

## Three tabs

- **CHAPTERS**: every chapter in its order, with where each stands. Click one, or
  its **Write** button, to open it.
- **WRITE**: one chapter, given the whole page. **Chapter** at the top switches
  to another; **View** chooses how to look at it: **Write** (the text alone),
  **Side by side** (the text beside the preview), or **Preview** (the chapter as
  the website will show it). The view you chose is remembered.
- **PLANETS**: the planet library, and the planet being made.

## Writing a chapter

**New chapter**, in CHAPTERS, asks for a title and opens it in WRITE. A chapter
has:

- **Title** and **One line**, shown under the title and along the orbit on the
  website.
- **Address**, the end of its link: `candy-heist.com/lore/the-planet`. It is
  made from the title, and **Match the title** makes it again. It is fixed while
  the chapter is published, so links to it keep working; unpublish it to change
  it.
- **Planet**, the one it is read beside. **Change** picks one of your planets or
  a preset.
- **Text**, written as in a word processor, with a bar over it. The preview
  is drawn by the same reader the website uses.

| Button           | Shortcut | What it writes     | What it shows                    |
| ---------------- | -------- | ------------------ | -------------------------------- |
| **B**            | `Ctrl+B` | `**words**`        | Bold                             |
| _I_              | `Ctrl+I` | `*words*`          | Italic, in the website's gold    |
| Heading          |          | `## A heading`     | A heading inside the chapter     |
| Bulleted list    |          | `- item`           | A list                           |
| Terms            |          | `- **Term**: text` | A term picked out, then its text |
| Large quote      |          | `> a line`         | A line set large, on its own     |
| Clear formatting |          |                    | Plain text again                 |

Each button turns its formatting off again on text that already has it. Enter
starts a new paragraph; in a list it starts the next item, and on an empty item
it ends the list. Shift+Enter breaks a line without starting a paragraph. Undo
and Redo, or `Ctrl+Z` and `Ctrl+Y`, step through the changes. The marks the bar
writes stay visible in the text, so it can be typed by hand too.

What is typed and not filed yet is also kept in the window's storage. If the
console closes first, the chapter opens with it next time, marked **Restored**.

## Publishing

**Publish** sends the chapter. With anything unsaved it reads **Save and
publish**, and files it first. A chapter needs a title, one line, some text, an
address and a planet to be published, and the page says which is missing.

A published chapter changed here reads **CHANGED**, and **Publish changes**
sends the new version. **Revert to published** drops the changes filed here and
goes back to what the website has.

**Unpublish** takes a chapter off the website and keeps it here as a draft.
**Delete** removes a draft from this PC; for a published chapter it reads
**Delete everywhere**, and takes it off the website too. Both ask first.

## The order

Drag a chapter by its grip, or move it with the arrows. The order is kept here.
When the website shows the published chapters in another order, the list says
so: **Publish order** sends this one, and **Use the website's** takes the
website's. A newly published chapter goes last on the website until the order
is published.

## Two writers

You each write on your own PC, and see each other's chapters once they are
published: the page fetches what is published when it opens, and again with
**Check for new**. A chapter the other person published opens here as it is on
the website, and becomes a draft on this PC when a change to it is filed.

If the other person published a chapter after your draft started from it,
publishing asks rather than writing over theirs: **Publish mine over theirs**,
or **Take theirs instead**, which drops your draft and opens their version. If
they took it off the website, publishing asks whether to put it back.

## Planets

**PLANETS** is the library: your planets, then the eleven presets the lore began
with. A preset never changes; **Duplicate to edit** makes a planet of yours from
it. **New planet** starts from a bare planet or any preset.

A planet is a stack of layers over a surface, a rim and a faint shade.

- **Add layer** offers 26 kinds in five groups: Structure, Network, Marks,
  Interference, and Beyond the edge. Any kind can be added more than once, up to
  24 layers.
- The list is the stack, top first. Drag a layer to restack it. Each can be
  hidden, locked, duplicated or removed.
- Pick a layer for its settings, on the right, folded into sections so only
  what's being changed is open: **Colour** and **Shape** to begin with, then
  **Movement** (still, spin, pulse, flicker or drift, each at its own speed),
  **Position and size**, and **Line and blend**. A closed section says what it
  is set to. Shape shows its main settings first, and the rest under **More
  shape settings**. The website holds motion still for visitors who ask for
  less.
- **Shuffle** redraws a layer's random parts and moves its shape controls
  somewhere near where they were. **Shuffle all** does every layer that is not
  locked. **Undo**, or `Ctrl+Z` outside a text field, steps back.
- **The planet itself**, under the layers, paints its surface, rim and shade.
- **Pause**, over the preview, holds the motion still to look closely.

Under the preview it says whether the planet is light or heavy for phones:
past about 1,500 shapes, a phone may stutter as the planet scrolls by.

Planets are kept on this PC. A published chapter carries a copy of its planet,
so changing a planet changes nothing on the website until the chapters drawn
with it are published again; until then they read **CHANGED**. A planet a
chapter uses cannot be deleted.

## Which website

As with CONTACT: the installed console publishes to the live website, and a
development copy to the development server on the same machine.
REGULATION → INTEGRATIONS → **Website address** overrides both. What each
website has published is kept apart; the drafts here are the same whichever
website is set.
