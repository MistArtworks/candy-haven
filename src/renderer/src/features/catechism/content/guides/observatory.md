# OBSERVATORY

## A board and a bench

![observatory-01-catalogue.png](observatory-01-catalogue.png)

The desk is two objects. Down the left, a **board** listing the whole kit,
grouped by what kind of thing each overlay is — chat instruments, clocks,
standing scenes, furniture. Beside it, a **bench** holding one overlay and
everything you do to it.

Running a break should not mean walking to INTERVAL, and closing a call should
not mean walking to THE MUSTER. During a broadcast the thing you need is almost
never the thing you are looking at.

## The board is a readout

Each row is a number, a mark, a name and a state dot — and **it stays quiet
until its overlay is doing something.** The moment a call opens or a clock
starts, that row grows its live figure and one line: `The roll is open · 12
filed · 02:40 left`.

Nothing on the board is pressed. Click a row and it loads into the bench;
hover one and it tells you what that overlay is for.

> Selecting a row hides nothing. Every overlay's state stays on the board —
> having to open each overlay in turn to find out what it was doing is the
> problem this page exists to remove.

## What each overlay actually does

Every overlay leads with a **kind** — `OPEN CALL`, `CHAT VOTE`, `BREAK CLOCK` —
and one plain sentence. Beneath that, three steps for how it runs, including
the chat command, which is the whole interface for three of them.

The lore line is still there, faint, at the bottom. It used to come first.

## Put it from here

![overlay-concord-console.png](overlay-concord-console.png)

The bench carries the **lead verb** on its own line at full size: whichever one
suits the phase the overlay is in. An open call leads with **Close the call**, a
stopped clock with **Start**.

Under it: the other verbs, a **Title** and a **Question**, one line for adding
an option or an entry, and the few settings that change between segments — a
call's length, how strictly a vote parses, a break's grace.

> **The bench carries what changes between segments. The overlay's own page
> carries what is set once.** Reordering a ballot or weighting an entry needs a
> list, so it stays on the page. **Open full console →** is one press away.

## Getting one into OBS

![observatory-02-card.png](observatory-02-card.png)

1. Select the overlay on the board.
2. Press **Copy** on the address you want.
3. In OBS, add a **Browser** source and paste it.
4. Set the width and height the address row quotes.
5. Leave "Shutdown source when not visible" off, so state survives a scene change.

**Preview** opens the same address in your own browser — what OBS will see,
rather than the console's own rendering of it.

Setting up from nothing? **Copy every address** puts the whole kit on the
clipboard, one labelled line each, in board order.

## Before you go live

**Guides off / on**, in the strip above the board, adds `?guides=1` to
everything the desk hands over, so you can position your sources against each
overlay's safe area. Turn it off and copy again before going live.

It is deliberately forgotten when you leave — a guide setting that survived a
restart is exactly how the guides end up on air.

> A control the service would refuse is drawn disabled with the reason beneath
> it. A control that _worked_ and has something to report says that in brass:
> `Sent 10. 30 did not fit and stayed on the roll.`
