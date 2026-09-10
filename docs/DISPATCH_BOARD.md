# The DISPATCH board

The one part of Candy Haven whose record does not live on the machine running
it. Two people use the application — **mist**, who builds it, and **candy**, who
asks for things — and the board is where the asking happens: an item is filed,
discussed, and then resolved or denied with a reason.

Both copies read and write one Firebase Realtime Database, so a change either of
them makes appears on the other within a moment.

---

## Where the security actually is

**In the database's rules, and nowhere else.**

This is worth stating plainly because the intuitive answer is wrong. A password
checked inside the application stops nobody: an attacker reaching the database
does not run the application, they run `curl`. Hashing the two passwords into
the build would have been worse than useless — two short passwords behind an
extractable hash fall to a dictionary in seconds, and it still would not have
closed the REST endpoint.

The rules run on Google's servers and every request passes through them,
including one made by hand. So the arrangement is:

1. Each person signs in with their own password, through Firebase
   Authentication. The password is exchanged for an ID token and **never
   stored** — Firebase holds it hashed; the app keeps only the tokens.
2. Every request the app makes to the database carries that token as `?auth=`.
3. The rules admit exactly two UIDs and refuse everything else.

The login is how the token is obtained. The rules are what enforce it.

### What this replaced

Until the rules went in, the database was in **test mode** — `".read": true,
".write": true` — which means unauthenticated. Anyone who guessed
`candy-haven-default-rtdb.firebaseio.com` could read the board, wipe it, or
fill it. That address is derivable from the project name, and open Firebase
databases are scanned for automatically, so this was a live exposure rather
than a theoretical one.

Test mode also expires roughly thirty days after the database is created, at
which point every request starts returning 401. Writing real rules was
unavoidable; doing it properly cost no more than doing it late.

---

## The rules

Held in [`database.rules.json`](../database.rules.json) at the repository root,
which is both the record of what is deployed and the thing to paste into
**Realtime Database → Rules** if it is ever lost.

Everything outside `candy-haven/dispatch` is denied by default — the Realtime
Database refuses anything a rule does not explicitly permit, and nothing else
grants access — so the rest of the database is closed too.

UIDs are not credentials. They identify an account the way a username does, and
knowing one grants nothing without the password behind it, which is why they can
sit in a public repository.

---

## The accounts

| Identity | UID | Rules on items |
| --- | --- | --- |
| `mist` | `Uc1ZbVbKXmU8cU5iSK3kWtNKXJD2` | yes |
| `candy` | `u9mDaxAH3MZbgyIPith4lBF4Mn63` | no |

Two Firebase email/password accounts. **Neither address appears anywhere in the
repository or in the build** — they are typed in at sign-in, and the app
recognises an account by its UID afterwards. A UID is opaque, is not a
credential, and grants nothing without the password behind it, which is why the
same two strings are also the access control in `database.rules.json`.

Those two tables must agree. A UID changed in one and not the other produces an
account that signs in and is then refused by the database, which reads as the
board being broken rather than as a misconfiguration.

Only mist resolves or denies. That is a division of labour rather than a
permission — the rules give both accounts identical access, and candy is not
prevented from anything by the database, only by the interface not offering it.
If that ever needs to be a real restriction it belongs in the rules, not in the
renderer.

---

## Setting up a second machine

1. Install Candy Haven.
2. Open **DISPATCH** (Ctrl+7). The Connection panel will say it is not
   configured.
3. Paste the `firebaseConfig` snippet from the Firebase console and press
   **Attach**. It is saved to `userData/firebase.json`; this happens once. The
   panel lives in REGULATION → BOARD.
   - The console's snippet carries no `databaseURL` — that block is generated
     for Firestore. The app derives the default Realtime Database address from
     the project id and **shows the address it resolved to**, because that
     derivation is a guess about the region: correct for a database created in
     the United States, wrong for one in Europe or Singapore. If it is wrong,
     paste a snippet with a `databaseURL` line in it.
4. Sign in on DISPATCH with the account's address and password. The refresh
   token is kept in the OS keystore, so this also happens once.

`info/firebaseconfig.md` is git-ignored and excluded from packaged builds. The
config is handed over directly rather than shipped.

---

## Notes for whoever changes this next

- **Nothing is applied optimistically.** A write goes to the database and comes
  back down the change stream like anyone else's. That costs a round trip per
  action and buys the thing that matters on a shared board: what is on screen is
  what the other person will see, not a guess that has to be walked back.
- **Refreshes are serialised through one promise.** Firebase rotates the refresh
  token on use, so five parallel exchanges would invalidate four of the results.
- **A stream's credential cannot be renewed in place.** Firebase sends
  `auth_revoked` and goes quiet, so that has its own handler and reconnects
  immediately rather than going through the error backoff — which would
  otherwise leave the board stale for a minute every hour.
- **Comments are keyed, not an array.** The Realtime Database has no list type,
  and two people commenting at once would collide on an index.
- **Unread is two timestamps**, one per person, rather than a read flag per
  comment. A comment counts as unread if it is newer than the reader's stamp and
  somebody else wrote it, which stays a subtraction however long a thread grows.
