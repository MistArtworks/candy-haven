# DISPATCH

Feedback and suggestions between operators, ruled on and recorded. The only
department whose record is not this machine's.

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
credential belongs to. Sign in once per machine and it stays signed in —
through a restart — until you sign out.

1. Type the account's address in **Account** and its **Password** in the band,
   and press **Sign in**.
2. The masthead then reads **Signed in as** and the name, with **Sign out**
   beside it.

The same sign-in opens CONTACT, SERVICES and LORE. Signing in on any of the
four signs in on all of them, and signing out here closes the other three.

The one rule that is enforced beyond that is that only the builder rules on an
item, and that is a division of labour rather than a permission.

> The door is drawn as a band across the page rather than as a modal. A modal
> would imply the board is behind it and merely hidden. It is not — it has not
> been fetched at all, because the shared database refuses an unauthenticated
> stream. There is nothing underneath to cover.

## Filing an item

1. Press **New item** (or `Ctrl`+`N`).
2. Give it a **Title**: one line, what it is.
3. Choose its **Kind**, the **Area** it is about, and a **Priority** if it
   matters.
4. Add **Detail** if the title is not enough: what you want, and why.
5. Press **File it**. It is on the other copy's board a moment later.

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
`INTERFACE`, `TELEMETRY`, `REGULATION`, `DISPATCH`.

An item keeps the area it was filed under even if a department is later renamed.
This is a record, and a record that rewrites itself is not one.

### Priority

`LOW` · `NORMAL` · `HIGH`. Set by whoever files it, and adjustable afterwards.

## Reading the board

**Search** finds words in a title or a body, **Status** narrows the board to
pending, resolved or denied items, and **Sort** orders it:

| Sort                 | Orders by                 |
| -------------------- | ------------------------- |
| `NEWEST FIRST`       | Most recently filed       |
| `OLDEST FIRST`       | The backlog, bottom up    |
| `RECENTLY DISCUSSED` | Where the conversation is |
| `PRIORITY`           | High first                |

`RECENTLY DISCUSSED` is the one to use when you come back after a few days — it
surfaces what moved, not what was added.

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
   was settled in haste, with its discussion intact.

**Withdraw** removes the item and its discussion altogether. It asks first, in
place: **Delete** to go ahead, **Keep** to change your mind.

| Status     | Means                                            |
| ---------- | ------------------------------------------------ |
| `PENDING`  | Open. Still in play                              |
| `RESOLVED` | Done. The reason records what was actually built |
| `DENIED`   | Not going to happen, with a reason               |

Both endings are **final and both stay visible**. Denying keeps the item and its
discussion; removing it deletes both. The distinction is the point — a denied
request that stays on the board is a record of a decision, and the same question
does not get asked twice.

Items you have not seen since they last changed are marked, so returning to the
board tells you where to look.

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

Until it is configured, this department says so rather than showing an empty
board.
