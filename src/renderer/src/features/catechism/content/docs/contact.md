# CONTACT

Messages sent from the website, read and answered. Behind the DISPATCH sign-in.

## Where they come from

The website's contact page files every message it is sent in the website's own
database, gives it a reference such as `MSG-7KQ2XD`, and shows the visitor
"Sent". That is the whole of the website's side: no email goes anywhere.

This console checks in with the website when it starts and every minute after,
while someone is signed in, and keeps a copy of what it finds. The page reads
the copy, so it opens at once, and it still opens with the network down.

## Signing in

CONTACT uses the DISPATCH sign-in: the same two accounts and the same session.
Signing in here signs in there, and signing out on DISPATCH closes this page
too. Until someone signs in nothing is fetched and nothing already copied is
shown, the rail's count included.

The website checks the sign-in itself before it hands anything over. The
website's database password is on no machine this console runs on; the
console only ever talks to the website.

## Reading a message

Pick a message from the list to open it beside the list. A **new** message
becomes **read** when it is opened.

| Status     | Means                                  |
| ---------- | -------------------------------------- |
| `NEW`      | Nobody has opened it yet               |
| `READ`     | Opened, not yet answered               |
| `REPLIED`  | Answered                               |
| `ARCHIVED` | Done with, and out of the default list |

**Reply by email** opens your own mail with the address and subject filled in.
Marking it **replied** is a separate step, because sending the email is not
something the console can see.

The list shows **INBOX** by default, which is everything not archived. **Show**
narrows it to one status or widens it to everything; **Search** looks through
the name, address, subject, message and reference.

## Status, offline

A status is set on the copy at once and sent to the website on the next
check-in, so it can be set with the network down. Until it is sent the message
says **WAITING TO SEND**. The other copy of the console sees it after its own
next check-in.

## Notes

The **Note** under a message is yours. It is kept on this machine only: the
website never sees it, and neither does the other copy of the console. It is
filed as you type.

## Deleting

**Delete** removes the message from the website, and then from here. It asks
first, and it cannot be undone. The other copy of the console loses it on its
next check-in.

Deleting needs the website, so while the console cannot reach it the button
reads **Connect to delete** and does nothing.

## Being told

- The rail counts new messages beside CONTACT, and marks PUBLICATION's heading
  while the division is folded away.
- A message that arrives while the console is running raises a Windows
  notification. Clicking it opens CONTACT.
- The first check-in after the console starts raises one notification saying
  what is waiting, if anything is.

## Which website

The installed console reads the live website. A development copy, run from
source, reads the development server on the same machine
(`http://localhost:3000`), so test messages never mix with real ones. Each
website has its own copy. REGULATION → INTEGRATIONS → **Website address**
overrides both.
