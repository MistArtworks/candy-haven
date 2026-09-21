# OBSERVATORY

The broadcast kit. Every overlay is a separate browser source served from one
local address, so OBS composites them and this console drives them.

![observatory-01-catalogue.png](observatory-01-catalogue.png)

## What each one does

Every overlay carries a **kind** and one plain sentence — on the desk, and in
its own masthead — so the kit can be read without already knowing the names.

| Overlay             | Kind                          | What it does                                                               |
| ------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| THE MUSTER          | OPEN CALL                     | Chat types entries; they fill a numbered list on screen                    |
| RESONANCE SELECTION | PRIZE DRAW                    | One entry is picked at random; bigger weights win more often               |
| THE CONCORD         | CHAT VOTE                     | Chat votes by typing a number; the bars fill live                          |
| INTERVAL            | MULTI-PURPOSE COUNTDOWN TIMER | A countdown for breaks that keeps counting past zero                       |
| CONVENING           | STREAM STARTING COUNTDOWN     | A countdown before you go live that ends on one word                       |
| THE GATE            | STARTING SCENE                | A full-screen "starting soon" scene with room for chat                     |
| THE SURVEY          | BRB SCENE                     | A full-screen "be right back" scene with room for chat                     |
| NOW TRANSMITTING    | NOW PLAYING                   | The track playing on your Spotify, with cover art and a timeline           |
| THE ENCLOSURE       | STREAM FRAME                  | Corner brackets and a name plate around the whole stream                   |
| THE CHORUS          | CHAT FEED                     | Chat messages as a numbered list. Pasted into Streamlabs, not served here  |
| THE DOCKET          | REQUEST QUEUE                 | A queue of chat requests showing what you are working on next _(reserved)_ |

The lore line each overlay carries — _"Harmony decided for all, not by all."_ —
is still there, set faint beneath the plain one. It used to be the **first**
thing every entry said after its name, which spent the top of the page on mood
rather than on function.

The bench also gives three plain steps for how each one runs. For THE CONCORD:
_you write the options_, _chat votes with `!vote 2` or a bare `2`_, _close it;
a tie is settled by a visible coin-toss_. A sentence can say what an overlay
is; only the steps say how it is used, and they carry the chat command — which
is the whole interface for three of these.

## The desk

The department's landing page is a desk rather than a directory, and it is two
objects side by side: a **board** listing the whole kit, and a **bench** holding
one overlay at a time.

That split is the point of the page. Running a break should not mean walking to
INTERVAL, and closing a call should not mean walking to THE MUSTER — during a
broadcast the thing you need is almost never the thing you are looking at.

### The board

Every overlay, always on screen, grouped by what kind of thing it is: **chat
instruments**, **clocks**, **standing scenes**, **furniture**, and whatever is
still **reserved**. Knowing THE GATE is a standing scene and THE ENCLOSURE is
furniture already tells you how each is placed in OBS.

Each row is a number, a mark, a name and a state dot — and that is the whole
row:

```
04  ▮▮  INTERVAL                                              ●
05  ((  CONVENING                                             ●
```

The dot carries the state: its colour and its pulse say whether that overlay is
running, and a running overlay's name is drawn brighter than a resting one's.
The figures themselves — `04:12`, `12 filed` — are on the bench, at full size,
for whichever overlay you are holding. Eleven rows each printing a number and a
sentence underneath was a wall of text in a 300px column.

**Nothing on the board is pressed.** It is a readout; everything you do to an
overlay is on the bench. Hovering a row says in one line what that overlay is
for, and clicking it loads that overlay into the bench.

Selecting a row hides nothing. Every overlay's state stays on the board,
because having to open each overlay in turn to find out what it was doing is
the problem this department exists to remove.

### The bench

One overlay, and everything you do to it.

It reads top to bottom in the order you work: what this is, what it is doing,
what to set, then the act.

| On the bench         | What it gives you                                             |
| -------------------- | ------------------------------------------------------------- |
| **The kind**         | `OPEN CALL`, `CHAT VOTE`, `PRIZE DRAW` — what this is         |
| **The live line**    | `The chamber sits · 240 votes from 63 citizens · 01:12 left`  |
| **The composer**     | Title, question, and one line to add an option or an entry    |
| **Between segments** | The few settings that change per call, per poll, per break    |
| **The lead verb**    | Full width, at the foot of the controls — the thing to press  |
| **The helpers**      | Clear, restart, hand a finished roll on, add or drop a minute |
| **Browser sources**  | Every address this overlay answers on, with Copy and Preview  |

**Open full console →** sits at the end of the kind's rule, at the top of the
bench, and goes to that overlay's own page. It is kept well away from the verbs
on purpose: it leaves the page, and the controls beside it do things to a live
broadcast.

The lead verb is set apart deliberately. It is whichever verb suits the phase
the overlay is in — an open call leads with **Close the call**, a stopped clock
with **Start** — and it is the one you reach for while talking. It runs the
full width of the bench, under everything it commits, with the helpers beneath
it. It is emphasised by size and position rather than by colour, because
crimson in this console means live state or destruction, and closing a call is
neither.

### What the bench carries, and what the page carries

**The bench carries what changes between segments. The overlay's own page
carries what is set once.**

A call's _length_ is on the bench, because "make this one thirty seconds" is a
per-call decision. Its _command word_ is not: `!add` is chosen once and then
printed on the broadcast, and changing it mid-stream would invalidate the
instruction the audience is reading. A countdown's duration is on the bench;
which of five faces it draws is not.

Reordering a ballot, weighting an entry and cutting one from a roll are
composition, and they stay on the overlay's page, where there is room for a
list.

### The composer

THE MUSTER, THE CONCORD and RESONANCE SELECTION are _put_ rather than merely
started, and each is put against text you write. All three take the same two
fields, because all three have the same pair in their own configuration:

- **Title** — the overlay's masthead.
- **Question** — what is being asked. `WHAT SHOULD BE PLAYED?`,
  `THE CHAMBER WILL DECIDE`.

Both save as you stop typing and appear on the broadcast immediately. They are
**the same two fields** as on the overlay's own page, drawn by the same
component — one setting in one place, reachable from two. They were two
separate fields writing one value, which is how a title could read differently
depending on where you had typed it.

Beneath them is one line for adding a single thing: an option to the ballot, a
petition to the ring, an entry filed on somebody's behalf. Enter commits, and
what is already filed is drawn as chips underneath so you can see it landed.

The overlay's own page is still where it is _composed_ — the ballot, the
marque, the five countdown faces, the presentation knobs. **Open full console
→** goes there. The split is that the bench runs an overlay and the page
configures it, and the bench is literally the same panel the page carries as
its own `02`.

### A control that is refused says why

A verb the service would turn down is drawn disabled with the reason beneath
it — `A poll needs at least two options`, `No chat channel is set`. The refusal
is the same one the main process enforces; it is mirrored here so a dead
control explains itself rather than throwing a notice at you mid-broadcast.

A verb that _worked_ and has something to report says that too, in brass rather
than crimson. Hand forty entries to a ten-option ballot and the line reads
`Sent 10. 30 did not fit and stayed on the roll.` A refusal is a fault; a
report is not, and drawing both crimson would teach you to read every notice
here as something having gone wrong.

> Opening the department starts the Spotify poll and attaches to chat, and both
> stop when you leave it. That is deliberate: a desk that reports whether a
> track is on air has to be listening, and finding out the channel name was
> wrong _after_ asking an audience to vote is not a recoverable moment.
>
> An overlay's **own page** does neither. It subscribes to its own state and
> nothing else, so opening THE ENCLOSURE does not start polling Spotify.

## The server

One HTTP server, many pages. It starts with the console by default and answers
on a port set in REGULATION under INTEGRATIONS.

It has no panel of its own, on purpose: a slab restating the port and the root
sat at the top of the department spending the best space on two numbers that
never change. What you actually need from it is in two places instead.

**In the masthead**, two state dots — whether chat is attending, and whether
the server is serving and how many sources are attached to it. If that reads
`0` while OBS is open, the source is not actually connected; check the URL
rather than the overlay.

**In the strip above the board**, the four things that are actions rather than
readings:

| Control                | Does                                                        |
| ---------------------- | ----------------------------------------------------------- |
| **Copy every address** | The whole live kit on the clipboard, one labelled line each |
| **Guides on / off**    | Adds `?guides=1` to every address the desk hands over       |
| **Restart server**     | Rebinds it, picking up a changed port                       |
| **Reconnect chat**     | Reattaches the chat socket                                  |

The port, the resolved paths and the rest live in REGULATION — under
INTEGRATIONS for the port, DIAGNOSTICS for everything else.

## Adding an overlay to OBS

![observatory-02-card.png](observatory-02-card.png)

1. Select the overlay on the board, then press **Copy** on the address you want.
2. In OBS: **Sources → Add → Browser**.
3. Paste the URL into **URL**.
4. Set **Width** and **Height** to the canvas the address row quotes.
5. Leave **Shutdown source when not visible** unchecked.

That last step matters. A source that shuts down loses its state, so a countdown
would restart every time you switched scenes away and back.

**Preview** beside it opens the same address in your own browser. That is
deliberately not a preview inside the console: the point of looking is to see
what OBS will see, and the console rendering it proves nothing.

Setting up a scene collection from nothing means adding nine sources, so
**Copy every address** on the broadcast panel puts the whole kit on the
clipboard at once — one labelled line per address, with its canvas.

```
THE MUSTER              1920x1080   http://127.0.0.1:7420/muster
THE MUSTER — WIDGET      460x380    http://127.0.0.1:7420/muster-widget
THE CONCORD              640x900    http://127.0.0.1:7420/concord
```

The desk hands over exactly the address the overlay's own page hands over, so
one overlay has one address wherever you copied it from.

### Full and panel

Each address row is marked one or the other, and it tells you how to place it.

- **full** — the overlay _is_ the scene. A rite, an interval card, the gate.
  Give it the whole canvas.
- **panel** — furniture composited over gameplay or a DAW capture.

### Transparency

Most panel overlays carry their own **Transparent** switch on their page, and
that is the one to use — it is a setting, it is remembered, and it is visible.

`?transparent=1` appended to an address does something narrower than it looks:
it **forces** transparency on for that one browser source, on top of the
setting. It cannot turn transparency off. Use it when two scenes need the same
overlay drawn two different ways, which is the only case the setting cannot
express.

THE ENCLOSURE is the exception and its address always carries the flag: it has
no setting of its own, because a frame that is not transparent is not a frame.

### Guides

**Draw safe-area guides on copied addresses**, on the broadcast panel, adds
`?guides=1` to every address the desk hands over. Position your sources with it
on, then turn it off and copy again before going live.

One switch rather than one per address, because guides are wanted on every
source at once while a scene is being cut and on none of them afterwards. It is
deliberately not remembered between sessions — a guide setting that survived a
restart is exactly how the guides end up on air.

### Two addresses, one poll

Some overlays answer on more than one address, each pinning a different
presentation of the _same_ live state. THE CONCORD serves a full scene at
`/concord` and a corner widget at `/concord-widget`.

Run both at once — the scene on what the audience is watching, the widget in the
corner of your working scene. They stay in step because there is one poll behind
them.

---

## The knobs

Every overlay carries the same three, in its **PRESENTATION** panel. They are
multipliers, not measurements — the style or theme you picked decides what the
overlay looks like and these nudge it from there, which is why they read in
multiples and why **Reset to preset** returns them to `1.00×`.

| Knob          | Range    | What it moves                                        |
| ------------- | -------- | ---------------------------------------------------- |
| **Scale**     | 0.5–2.0× | The whole layout                                     |
| **Type size** | 0.5–2.0× | Text only, on top of scale. Spacing follows the type |
| **Opacity**   | 10–100%  | The whole surface                                    |

Two overlays add one of their own. **NOW TRANSMITTING** has a **Cover size**,
because the artwork and the text compete for the same room in all four styles
and making the whole plate bigger is not the same request. **THE MUSTER** has an
**Instruction size**, because that line is the only thing on the broadcast
written for the audience rather than for you.

Opacity composes with whatever the overlay already does of its own accord — NOW
TRANSMITTING still fades out between tracks, at your level rather than instead
of it.

Everything defaults to `1.00×`, so a scene you cut before these existed renders
exactly as it did.

## THE MUSTER

An open call. You put a question on the scene and chat files entries against it.

![overlay-muster-console.png](overlay-muster-console.png)

1. Type the question in the console and open the call.
2. Chat files entries by typing `!add` followed by their entry. The command word
   is configurable; the scene always displays the current instruction, so the
   audience is told what to type without you explaining it.
3. The roll fills on the broadcast, numbered and credited to each citizen.
4. Close the call, or let a settable clock run it down.

One entry per citizen by default, and duplicates are refused.

**The hand-off is the point.** A finished roll can be handed straight to
RESONANCE SELECTION or THE CONCORD, so an open call becomes a draw or a vote
without anyone re-typing anything.

## RESONANCE SELECTION

A weighted draw. The field chooses one petition.

![overlay-selection-scene.png](overlay-selection-scene.png)

The winner is drawn in the main process **before** the animation begins, and the
console and browser source then animate the same outcome in step. The spin is a
presentation of a decision already made — it cannot land somewhere other than
where the draw said.

**Three mechanisms**, chosen per rite:

| Mechanism        | How it draws                                   |
| ---------------- | ---------------------------------------------- |
| `RESONANCE RING` | The ring turns beneath a fixed pointer         |
| `THE PROCESSION` | Petitions stream past the mark and one is held |
| `THE DESCENT`    | The motes are loosed and Nayara takes one      |

**Weights.** A petition can carry a weight from 1 to 999. A petition weighted 3
occupies three times the field of one weighted 1 — so a subscriber's entry, or a
request someone paid for, can count for more without being a separate list.

**Elimination mode** withdraws the winner from the pool, so a series of draws
walks through the field rather than repeating itself.

Petitions can be filed by you or by chat, one entry per citizen.

## THE CONCORD

Chat votes on a ballot; a deadlock is settled by casting lots.

![overlay-concord-console.png](overlay-concord-console.png)

- One vote per citizen, changeable while the chamber sits.
- A settable window, or open until you close it.
- A deadlock escalates to **THE CASTING** — equal lots, one is taken.

**How a vote is recognised** is a real trade-off, and you choose it:

| Syntax         | Counts                      |
| -------------- | --------------------------- |
| `COMMANDED`    | Only `!vote 2` and the like |
| `BARE NUMERAL` | Only a lone `2`             |
| `EITHER`       | Both forms                  |

A bare numeral gets several times the turnout, because most of an audience will
not learn a syntax. It also collides with ordinary conversation — so the parser
refuses ambiguous messages rather than guessing at them.

## NOW TRANSMITTING

Live Spotify playback: track, artist, cover plate and timeline.

Four presentations, each a starting point you can then adjust:

| Preset       | What it is                                                      |
| ------------ | --------------------------------------------------------------- |
| **Plate**    | Cover slab left, record right, timeline beneath. The lower band |
| **Monolith** | Portrait column, cover above the record. For a sidebar          |
| **Strip**    | Thin lower third on a hairline timeline. Takes almost no height |
| **Disc**     | Cover as a turning record inside a timeline ring. For a corner  |

The timeline is interpolated locally between polls so it moves smoothly rather
than jumping once a second, and cover art is inlined by the main process rather
than fetched by the scene. It hides itself when nothing is playing.

Needs a Spotify client id in REGULATION → INTEGRATIONS, then **Link** to
authorise. The password never crosses into the console — the main process holds
only the tokens that come back.

## INTERVAL and CONVENING

Two countdowns sharing one implementation and one set of faces, with separate
state so both stay configured at once.

They are not the same instrument with two names, and the differences are
defaults rather than preferences — they follow from what each is _for_:

|                | INTERVAL                         | CONVENING                    |
| -------------- | -------------------------------- | ---------------------------- |
| For            | Breaks and segments              | Opening a broadcast          |
| Starts at      | 5 minutes                        | 10 minutes                   |
| Past zero      | Counts a grace period in crimson | Resolves to a single word    |
| Grace          | One minute                       | None — a room is not overrun |
| Audio cues     | One minute, and final call       | Silent by default            |
| Blinks when up | Yes                              | No — it has arrived          |
| Default face   | `SPLIT PLATES`                   | `HARMONIC PULSE`             |

On the bench each states which it is rather than leaving you to know:
`Breaks and segments · 5 min · 1 min of grace · cues on` against
`Opens the broadcast · 10 min · resolves to NOW · silent`. And at zero they
report opposite things, because they mean opposite things — an interval is
**Spent**, a convening reads the word it **arrived** at.

Only CONVENING carries a **Resolves to** field, for the same reason. If the
bench you are looking at has one, it is the one that opens the stream.

CONVENING is silent on purpose: nothing should warn an audience that it is
nearly time.

**Five faces**, chosen per timer:

| Face              | Draws as                                                      |
| ----------------- | ------------------------------------------------------------- |
| `SPLIT PLATES`    | Engraved slabs, each digit turning over                       |
| `ROLLING DIGITS`  | Bare numerals, the spent digit rising out as the next arrives |
| `RESONANCE ARC`   | A graduated ring draining around the readout                  |
| `SEDIMENT COLUMN` | A brutalist stack emptying downward                           |
| `HARMONIC PULSE`  | A ring emitted on every second                                |

Durations run from one second to twelve hours — past that a countdown is a
calendar, not a timer. The grace period can run up to an hour past zero.

The **terminal word** is what CONVENING resolves to when it reaches zero. It
defaults to `TIME`; `NOW` and `LIVE` are the obvious alternatives.

Console chords: `Space` starts or holds, `Ctrl`+`Enter` restarts from the top,
`Ctrl`+`↑` and `Ctrl`+`↓` add and remove a minute mid-run.

### Sound

A clock ticks under either countdown while it runs, and each arrives at
something of its own: a bass figure when INTERVAL runs out, a granular impact
when CONVENING reaches zero.

**Ticking clock** is a separate setting from **Audio cues**, because they are
different kinds of noise. The cues are three chimes at moments that matter; the
clock is a bed that plays for the whole duration. Turning the chimes off does
not silence the clock, and it is not meant to.

Both play in the console and never on the broadcast — see above for why.

> CONVENING ships with **Audio cues** off, since nothing should warn an audience
> it is nearly time. Its impact needs that setting turned on.

## THE ENCLOSURE

A standing frame for the whole broadcast: gold registration brackets at the four
corners, and one plinth along the bottom carrying your marque. Nothing along the
edges — it says where the boundary is without spending it.

It is the only overlay in the kit that holds no live state. There is nothing to
start or stop, because the frame is settled entirely by the address it is loaded
at, which is why its console page is a composer rather than a control panel.

| Setting     | What it does                                                |
| ----------- | ----------------------------------------------------------- |
| **Marque**  | The name along the plinth. Uppercased, 32 characters        |
| **Section** | The numeral at the right of the plinth                      |
| **On air**  | Lights the crimson pip — the only colour on the whole frame |

Because the settings ride in the address, changing one means pasting the new URL
into OBS rather than reloading the source. It also means two scenes can carry
two enclosures with different marques at once, which a saved setting could not
express.

The centre is fully transparent, so it dresses a capture rather than replacing
one. Append `?guides=1` while you are cutting the scene to outline the inset the
brackets sit on; the guide never appears on air.

## THE GATE

The stream-starting scene: a causeway running to a colossal ribbed portal, a
shaft of light standing in its aperture, and the procession still walking
toward it. The NEXUS landing field, put to work.

It is the only overlay that **replaces** a capture rather than dressing one — a
stream that has not started has nothing behind it to dress — so it is the one
source that does **not** want Transparent ticked in OBS.

| Setting                | What it does                                                    |
| ---------------------- | --------------------------------------------------------------- |
| **Title**              | The marque, set low and left. Uppercased                        |
| **Second line**        | A quieter line beneath it                                       |
| **Band width**         | The share of the frame held for a chat capture. Zero removes it |
| **Top / lower colour** | The two stops of the band’s gradient                            |
| **Band strength**      | How present the band is overall                                 |

The band is **painted here rather than held clear**, which is the one place
this differs from the rest of the kit. Everywhere else a reserved band is left
empty so a capture can be composited into it; here the scene is what the
audience is looking at while they wait, and chat over bare artwork is
unreadable. It always fades out by the bottom whatever colours you pick, so
the causeway still runs out of the frame.

The marque sits beside the band rather than centred, because the portal is the
one thing in the composition that has to stay unobstructed.

Like THE ENCLOSURE, nothing is saved: the address carries the settings, so
changing one means pasting the new URL rather than reloading the source.

## THE SURVEY

Be right back. A barred spiral seen from above and to one side, turning, with
the resonance plexus threaded through the whole disc.

The same page and the same settings as THE GATE — marque, second line, chat
band, gradient and knobs — with a different field behind it. The two are one
implementation: which scene you get is decided by the address, the way the two
countdowns share a page and differ by theirs.

It starts on **BACK SHORTLY**, where the gate starts on **STREAM STARTING**
**SOON**. Both are yours to change.

Like the gate it is a scene rather than furniture, so it does not want
**Transparent** ticked.

## THE CHORUS

![overlay-chorus-console.png](overlay-chorus-console.png)

Chat as an institutional register — numbered entries, one crimson mark on the
newest.

It is the one item in the kit with **no address**. Streamlabs hosts its own chat
widget, so this console configures the appearance and hands over the code:
configure it, copy, and paste into the Streamlabs chat widget's custom CSS and
HTML fields.

## Rehearsal

REGULATION has a **REHEARSAL** category — test mode, for exercising the kit
without a live audience. Use it to check an overlay's layout, cues and timings
before a broadcast rather than finding out during one.

With it on, three overlays grow a **Simulator** panel:

| Overlay             | Fills      | With                             |
| ------------------- | ---------- | -------------------------------- |
| THE MUSTER          | the roll   | synthetic filings, 8 / 20 / 60   |
| RESONANCE SELECTION | the roster | synthetic petitions, 6 / 16 / 32 |
| THE CONCORD         | the tally  | synthetic votes, 25 / 250 / 1000 |

None of them write to the overlay's state directly. A simulated filing goes
through the real chat command, the real per-citizen ledger and the real
duplicate rule; a simulated vote through the real parser and the real counting
path. That is the point — a simulator that appended to an array would prove
only that arrays can be appended to.

So expect the ceilings to bite, because they are the thing being exercised. Ask
the muster for sixty filings on a roll that holds forty and forty arrive, the
rest are turned away, and the count beside the roll says so.

Each also carries a second button that files repeatedly **as one person** or
reuses voter ids, which is how the per-citizen caps are checked: the messages
keep arriving, the roll or the tally stops growing, and the citizen count holds.

It is gated on the setting rather than on a development build, deliberately.
The evening before a stream is exactly when anybody wants to fill a ring and
look at it, and by then you are running an installed copy.
