# DISPATCH

## The shared board

![dispatch-01-board.png](dispatch-01-board.png)

The only department whose record is not this machine's. Two people use Candy
Haven — one asks for things, the other builds them — and both copies of the app
see the same list within a moment of each other.

An item is filed here, discussed, and then resolved or denied with a reason.

## Signing in, not choosing

![dispatch-02-door.png](dispatch-02-door.png)

Two accounts exist, one per operator, each with its own address and password.
Candy Haven never checks the password itself — it is exchanged with Firebase
for a token, and the shared database is what refuses everyone else. Sign in
once per machine; it stays signed in until you sign out. The same sign-in
opens CONTACT, SERVICES, LORE and RELEASES.

MIST builds and rules on items; CANDY asks. That is a division of labour rather
than a permission. Setup lives in REGULATION → **BOARD**.

## Filing, replying, ruling

![dispatch-04-file.png](dispatch-04-file.png)

1. Press **New item** (or `Ctrl`+`N`), give it a title, a kind, an area and a
   priority, and press **File it**.
2. Open any item to read its thread, and **Post** a reply.
3. The builder rules on it: **Resolve**, or **Deny** with a reason. Both stay
   on the board, and **Put back to pending** reopens either.

## What's new, and notices

![dispatch-05-marks.png](dispatch-05-marks.png)

**NEW** marks an item you've never opened, a crimson count marks comments since
you last did, and **NOW RESOLVED** or **NOW DENIED** marks a status that
changed. DISPATCH in the rail counts the items with something new.

When the other operator files, comments or rules, a notice says so in the
console, or as a Windows notification when the console isn't in front; click
it to open the item. Opening Haven says once what happened while it was
closed. REGULATION → **BOARD** → **Notify me** turns the notices off.

> Nothing is applied optimistically. A write goes to the shared database and
> comes back, so what you see on the board is what the other copy sees.
