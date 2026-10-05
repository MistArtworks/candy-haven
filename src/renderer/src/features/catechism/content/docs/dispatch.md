# DISPATCH

Feedback and suggestions between operators, ruled on and recorded. The only
department that keeps no copy of its record on this machine: the board is read
live from a database the two copies share.

![dispatch-01-board.png](dispatch-01-board.png)

## Why it is different

Two people use Candy Haven: one asks for things, the other builds them. Until
this department existed the asking happened somewhere else — a chat window, a
note — and nothing connected a request to what was done about it.

An item is filed here, discussed, and then resolved or denied with a reason.
Both copies of the application see the same list within a moment of each other,
because the record lives in a database they share rather than on either machine.

## Identity

![dispatch-02-door.png](dispatch-02-door.png)

Signing in is real. Two accounts exist, one per operator, each with its own
address and password. Candy Haven never checks the password itself — it is
exchanged with Firebase for a token, and the shared database is what refuses
everyone who does not carry one. That is the actual security; the door is only
how the token is obtained.

Identity is not chosen, it is resolved: whichever of the two accounts the
credential belongs to, **MIST** or **CANDY**. MIST builds and rules; CANDY asks.
Sign in once per machine and it stays signed in, through a restart, until you
sign out. If the stored sign-in is ever refused, the masthead says **The sign-in
expired. Sign in again.**

1. Type the account's address in **Account** and its **Password** in the band,
   and press **Sign in**.
2. The masthead then reads **Signed in as** and the name, with **Sign out**
   beside it.

The same sign-in opens CONTACT, SERVICES, LORE and RELEASES. Signing in on any
of the five signs in on all of them, and signing out here (or in REGULATION →
**BOARD**) closes the other four: CONTACT and SERVICES show nothing, LORE and
RELEASES can't publish, and the quick strip reads **Not signed in**.

Only the builder rules on an item. That is a division of labour the interface
keeps, rather than a permission the database enforces.

> The door is drawn as a band across the page rather than as a modal. A modal
> would imply the board is behind it and merely hidden. It is not — it has not
> been fetched at all, because the shared database refuses an unauthenticated
> stream. There is nothing underneath to cover.

## Filing an item

1. Press **New item** (or `Ctrl`+`N`). Both wait until you are signed in and
   the board is attached. The palette's **Compose** opens the same form from
   anywhere.
2. Give it a **Title**: one line, what it is.
3. Choose its **Kind**, the **Area** it is about, and a **Priority** if it
   matters.
4. Add **Detail** if the title is not enough: what you want, and why.
5. Press **File it**. It is on the other copy's board a moment later.

The form opens above the list rather than over it. **Cancel** puts it away.

![dispatch-04-file.png](dispatch-04-file.png)

### Kinds

| Kind         | For                                       |
| ------------ | ----------------------------------------- |
| `IDEA`       | Something that might be worth doing       |
| `SUGGESTION` | A change to something that already exists |
| `REQUEST`    | Something wanted, specifically            |
| `FAULT`      | Something is broken                       |

The distinction between an IDEA and a REQUEST is how settled it is, and it is
worth keeping honest — a board where everything is a REQUEST cannot be
prioritised.

### Areas

The department the item is about: `GENERAL`, `NEXUS`, `ARCHIVE`, `OBSERVATORY`,
`INTERFACE`, `TELEMETRY`, `REGULATION`, `DISPATCH`. Anything about another
department, ARTISTS or the quick strip say, is filed under `GENERAL` with the
department named in the title.

An item keeps the area it was filed under even if a department is later renamed.
This is a record, and a record that rewrites itself is not one.

### Priority

`LOW` · `NORMAL` · `HIGH`. Set by whoever files it. Once filed, an item's title,
detail, kind, area and priority stay as they were filed; say what changed in the
discussion instead.

## Reading the board

**Search** finds words in a title or a body, **Status** narrows the board to
pending, resolved or denied items, and **Sort** orders it:

| Sort                 | Orders by                 |
| -------------------- | ------------------------- |
| `NEWEST FIRST`       | Most recently filed       |
| `OLDEST FIRST`       | The backlog, bottom up    |
| `RECENTLY DISCUSSED` | Where the conversation is |
| `PRIORITY`           | High first                |

`RECENTLY DISCUSSED` is the default, and the one to use when you come back after
a few days: an item rises when it's filed, commented on or ruled on, so the top
of the board is where things moved. Opening an item doesn't move it.

## Discussion and rulings

![dispatch-03-thread.png](dispatch-03-thread.png)

Every item carries a thread. Either operator can comment; only the builder can
rule.

### How to reply

1. Open the item from the board.
2. Write in **Reply** and press **Post**.

### How to rule

Only the builder sees these.

1. Open the item.
2. Write the **Reason**: required to deny, optional to resolve, and read first
   by whoever filed it.
3. Press **Resolve** or **Deny**. **Put back to pending** reopens an item that
   was settled in haste: its discussion stays, its ruling's reason is cleared.
   A resolved item can also be denied, or a denied one resolved, directly.

**Withdraw** removes the item and its discussion altogether, and is the
builder's too. It asks first, in place: **Delete** to go ahead, **Keep** to
change your mind.

| Status     | Means                                            |
| ---------- | ------------------------------------------------ |
| `PENDING`  | Open. Still in play                              |
| `RESOLVED` | Done. The reason records what was actually built |
| `DENIED`   | Not going to happen, with a reason               |

Both endings **stay visible**, and both can be reopened. Denying keeps the item
and its discussion; withdrawing it deletes both. The distinction is the point — a denied
request that stays on the board is a record of a decision, and the same question
does not get asked twice.

## What's new since you last looked

![dispatch-05-marks.png](dispatch-05-marks.png)

Three marks on the board tell you where to look when you come back:

- **NEW** on an item the other operator filed that you have never opened.
- **A crimson count** of the other operator's comments since you last opened it.
- **NOW RESOLVED**, **NOW DENIED** or **NOW PENDING** when the other operator
  changed the item's status since you last opened it.

Opening an item clears its marks. Your own items, comments and rulings never
mark. The board's header counts the items with something new (**3 new**), and
so does DISPATCH in the rail, with a dot on its division's heading while that
is folded away, the way CONTACT and SERVICES count what is waiting from the
website.

### Notices

![dispatch-06-notice.png](dispatch-06-notice.png)

When the other operator files an item, comments, or changes a status, you hear
of it as it happens:

- **In the console**, a notice with **Open**, which opens the item. Not while
  DISPATCH is the page you're on: the board marks it there as it lands.
- **As a Windows notification** when the console isn't in front: on the strip,
  in the tray, or behind another window. Clicking it opens the console at the
  item.
- **On opening Haven**, one notice for what happened while it was closed:
  "2 items have something new since you last looked".

More than two things arriving at once (back from sleep, say) come as one notice,
not a stack. Your own actions never notify you, even from another PC signed in
as you.

REGULATION, under **BOARD**, has **Notify me** to switch the notices off. The
marks and the counts show either way.

## How the sync behaves

Nothing is applied optimistically. A write goes to the shared database and comes
back before the board updates, so what you see is what the other operator sees
rather than a local guess that might not have landed.

The trade is that a write feels a moment slower than a local one. On a board two
people share, that is the right way round.

## Setup

The board needs a shared Firebase project, configured in REGULATION under
**BOARD**. Paste the whole snippet the Firebase console shows — it is parsed
rather than requiring you to pick the JSON out of it.

Until it is configured, the band across the page says so, **The board is not
attached to a database yet**, with a link to REGULATION → **BOARD**. Email and
password sign-in must be enabled in the Firebase project, and the two accounts
must be the ones named in its database rules.
