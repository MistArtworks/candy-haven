# CONTACT

Messages sent from the website, read and answered. Behind the DISPATCH sign-in.

![contact-01-inbox.png](contact-01-inbox.png)

## Where they come from

The website's contact page files every message it is sent in the website's own
database, gives it a reference such as `MSG-7KQ2XD`, and shows the visitor
"Sent". That is the whole of the website's side: no email goes anywhere.

This console checks in with the website when it starts, when someone signs in,
when REGULATION's **Website address** changes, and when you press **Check for
new** at the top of the page. It never checks on a timer, so a message sent
while the console is open shows up the next time you press the button. What it
finds is kept as a copy; the page reads the copy, so it opens at once, and it
still opens with the network down.

One check-in serves CONTACT and SERVICES together: pressing **Check for new** on
either page brings in both the messages and the DJ enquiries.

## Signing in

CONTACT uses the DISPATCH sign-in: the same two accounts and the same session.
Signing in here signs in there, and on SERVICES, LORE and RELEASES too; signing
out on DISPATCH closes this page as well. Until someone signs in nothing is
fetched and nothing already copied is shown, the rail's count included.

### How to sign in

1. Open CONTACT. While nobody is signed in, a band across the page reads
   **Sign in to open CONTACT**.
2. Type the account's address in **Account** and its password in **Password**.
3. Press **Sign in**, or Enter in either field. The page opens and checks in
   with the website straight away.

After a refused attempt the password field is empty and the address is kept,
so only the password needs typing again. If the page says this machine has no
Firebase config yet, the sign-in itself is not set up: it is added in
REGULATION → BOARD, as the DISPATCH chapter describes.

The website checks the sign-in itself before it hands anything over. The
website's database password is on no machine this console runs on; the
console only ever talks to the website.

## The page

| Part                   | What it is                                                         |
| ---------------------- | ------------------------------------------------------------------ |
| **Website**, top right | Which website this page reads                                      |
| The status beside it   | When it last checked, as `Checked · 2h ago`, or what went wrong    |
| **Check for new**      | Asks the website for anything sent or deleted since the last check |
| **01 MESSAGES**        | The list, with how many are new and how many there are in all      |
| **02 MESSAGE**         | The message picked in the list. **Close** puts it away             |

Each message in the list shows its reference, its subject, who sent it and from
which address, how long ago it came, and where it stands. A new one carries a
**NEW** mark at the front; an archived one is drawn fainter.

## How to check for new messages

1. Press **Check for new**. While it works the button is busy, and the status
   reads `Checking in with` and the website's name.
2. When it is done the status reads `Checked · just now`. Anything new is in the
   list with a **NEW** mark, and counted at the top of **MESSAGES**.

A message deleted from the other copy of the console leaves this list on the
same check.

## How to find a message

- **Search** looks through the name, the address, the subject, the message and
  the reference, so a visitor quoting `MSG-7KQ2XD` back to you is found at once.
- **Show** chooses what the list holds. **INBOX**, the default, is everything
  not archived; **ALL** adds the archived ones; **NEW**, **READ**, **REPLIED**
  and **ARCHIVED** show one status each.

The two apply together, and a list they empty says **Nothing matches that.**
Both go back to their defaults when you leave the page.

## How to read and answer a message

1. Press **Check for new** to fetch anything sent since the last check.
2. Pick a message in the list. It opens beside the list, and a **NEW** message
   becomes **READ**. Pick it again, or press **Close**, to put it away.
3. Read who sent it and the message itself. Only what they filled in is shown:
   **FROM**, **EMAIL**, **PHONE**, **ORGANISATION**, **DATE**, **LOCATION**,
   **BUDGET** and **LINKS**. **DATE** and **LOCATION** are what they wrote about
   the work; **RECEIVED** is when the message arrived.
4. Press **Reply by email**. Your own mail opens with their address, and the
   subject filled in as `Re:` followed by theirs. The address under **EMAIL**
   opens your mail too.
5. Once you have replied, set **Status** to **REPLIED**. Sending the email is
   not something the console can see, so this step is yours.
6. Write anything worth remembering in **Note**. It is filed as you type.
7. When it is dealt with, set **Status** to **ARCHIVED**. It leaves the default
   list but is never lost.

![contact-02-message.png](contact-02-message.png)

| Status     | Means                                  |
| ---------- | -------------------------------------- |
| `NEW`      | Nobody has opened it yet               |
| `READ`     | Opened, not yet answered               |
| `REPLIED`  | Answered                               |
| `ARCHIVED` | Done with, and out of the default list |

Any status can be set by hand at any time. Setting **NEW** again marks a message
unread: it is counted on the rail until it is next opened.

## Statuses and notes are yours

A status is your own tracking, and so is the **Note** under a message. Both are
kept on this machine only: the website never sees them, and neither does the
other copy of the console. Both work with the network down.

A note holds up to 4,000 characters. It is filed once you stop typing for a
moment, and again as the message closes, so moving on never loses what was
typed. There is no save button.

The website holds only what the visitor sent.

## How to delete a message

1. Open the message.
2. Press **Delete** at the foot of it. It asks **Delete from the website and
   here?**
3. Press **Delete** again to confirm, or **Keep** to change your mind.

Deleting removes the message from the website, and then from here, and cannot
be undone. The other copy of the console loses it on its next check-in.
Deleting needs the website, so while the console cannot reach it the button
reads **Connect to delete** and does nothing. Once the network is back, press
**Check for new**, and Delete returns.

## When the website can't be reached

The copy still opens, and statuses and notes still work, because they never
needed the website. What needs it waits: new messages, and deleting.

The status at the top right says what went wrong:

| It reads                                           | Means, and what to do                                            |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| `Could not reach` the website                      | No network, or the website is down. Check for new again later    |
| The website `cannot reach its database right now.` | The website is up and its database is not. Try again later       |
| The website `is not set up for the console yet.`   | The website still needs its settings; nothing here can change it |
| `The website did not accept the sign-in.`          | Check for new again; if it repeats, sign out and back in         |
| `The website does not let this account in.`        | The account is not one of the two the website lets in            |
| `The website is refusing this machine for an hour` | Too many refused sign-ins from here. Wait the hour out           |

A message deleted from the other copy while you had it open says **That message
is not here any more.** when you change it. Press **Check for new**, and the
list catches up.

## Being told

- The rail counts new messages beside CONTACT, and marks COMMUNITY's heading
  while the category is folded away.
- After the first check-in of a session, usually as the console starts, one
  Windows notification, **Waiting on the website**, says what is waiting, if
  anything is: `2 messages and 1 DJ enquiry are waiting.` Clicking it brings the
  console forward on CONTACT, or on SERVICES when only enquiries are waiting.
- If the page showing has changes not filed yet, the click leaves you on it and
  points at them instead, so nothing half-made is lost.

Only **NEW** messages are counted: opening one, or giving it any other status,
takes it off the count.

## Which website

The installed console reads the live website, named at the top right of the
page. A development copy, run from source, reads the development server on the
same machine (`http://localhost:3000`), so test messages never mix with real
ones. Each website has its own copy. REGULATION → INTEGRATIONS → **Website
address** overrides both, for CONTACT, SERVICES, LORE and RELEASES alike; left
empty, each copy of the console uses its own default.
