# CONTACT

Messages sent from the website, read and answered. Behind the DISPATCH sign-in.

![contact-01-inbox.png](contact-01-inbox.png)

## Where they come from

The website's contact page files every message it is sent in the website's own
database, gives it a reference such as `MSG-7KQ2XD`, and shows the visitor
"Sent". That is the whole of the website's side: no email goes anywhere.

This console checks in with the website when it starts, when someone signs in,
and when you press **Check for new** at the top of the page. It never checks on
a timer, so a message sent while the console is open shows up the next time you
press the button. What it finds is kept as a copy; the page reads the copy, so
it opens at once, and it still opens with the network down.

## Signing in

CONTACT uses the DISPATCH sign-in: the same two accounts and the same session.
Signing in here signs in there, and signing out on DISPATCH closes this page
too. Until someone signs in nothing is fetched and nothing already copied is
shown, the rail's count included.

The website checks the sign-in itself before it hands anything over. The
website's database password is on no machine this console runs on; the
console only ever talks to the website.

## How to read and answer a message

1. Press **Check for new** to fetch anything sent since the console started.
2. Pick a message in the list. It opens beside the list, and a **NEW** message
   becomes **READ**.
3. Read who sent it (**FROM**, **EMAIL** and whatever else they filled in) and
   the message itself.
4. Press **Reply by email**. Your own mail opens with their address and the
   subject filled in.
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

The list shows **INBOX** by default, which is everything not archived. **Show**
narrows it to one status or widens it to **ALL**; **Search** looks through the
name, address, subject, message and reference.

## Statuses and notes are yours

A status is your own tracking, and so is the **Note** under a message. Both are
kept on this machine only: the website never sees them, and neither does the
other copy of the console. Both work with the network down.

The website holds only what the visitor sent.

## How to delete a message

1. Open the message.
2. Press **Delete** at the foot of it.
3. Press **Delete** again to confirm, or **Keep** to change your mind.

Deleting removes the message from the website, and then from here, and cannot
be undone. The other copy of the console loses it on its next check-in.
Deleting needs the website, so while the console cannot reach it the button
reads **Connect to delete** and does nothing.

## Being told

- The rail counts new messages beside CONTACT, and marks PUBLICATION's heading
  while the division is folded away.
- When the console starts, one Windows notification says what is waiting, if
  anything is. Clicking it opens CONTACT.

## Which website

The installed console reads the live website. A development copy, run from
source, reads the development server on the same machine
(`http://localhost:3000`), so test messages never mix with real ones. Each
website has its own copy. REGULATION → INTEGRATIONS → **Website address**
overrides both, for CONTACT, SERVICES and LORE alike.
