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

There is no login and there will not be one.

You are asked for one field, because **the password is the name**: there are two
accounts and one password each, so asking who you are before asking for proof
would be asking a question the answer already contains. Your identity is
remembered per machine.

Identity **labels** an item rather than authorising anything. The one rule that
is enforced is that only the builder rules on an item, and that is a division of
labour rather than a permission — a password on a board two people share
protects nothing and would be one more thing to lose.

> The door is drawn as a band across the page rather than as a modal. A modal
> would imply the board is behind it and merely hidden. It is not — it has not
> been fetched at all, because the shared database refuses an unauthenticated
> stream. There is nothing underneath to cover.

## Filing an item

1. Write what you want, plainly.
2. Choose its **kind**.
3. Choose the **area** it is about.
4. Set a **priority** if it matters.
5. File it.

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
