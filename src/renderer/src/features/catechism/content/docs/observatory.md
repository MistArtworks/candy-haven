# OBSERVATORY

The broadcast kit. Every overlay is a separate browser source served from one
local address, so OBS composites them and this console drives them.

![observatory-01-catalogue.png](observatory-01-catalogue.png)

## The server

One HTTP server, many pages. It starts with the console by default and answers
on a port set in REGULATION under INTEGRATIONS.

| Field            | Meaning                                                |
| ---------------- | ------------------------------------------------------ |
| **Root**         | The address every overlay hangs off                    |
| **Port**         | Claimed upward from the configured one if it was taken |
| **Commissioned** | How many overlays have shipped, of those catalogued    |
| **Attached**     | Browser sources currently connected                    |

If **Attached** reads `0` while OBS is open, the source is not actually
connected — check the URL rather than the overlay.

## Adding an overlay to OBS

![observatory-02-card.png](observatory-02-card.png)

1. Copy the address from the overlay's card in the catalogue.
2. In OBS: **Sources → Add → Browser**.
3. Paste the URL into **URL**.
4. Set **Width** and **Height** to the canvas the card quotes.
5. Leave **Shutdown source when not visible** unchecked.

That last step matters. A source that shuts down loses its state, so a countdown
would restart every time you switched scenes away and back.

```
http://127.0.0.1:7420/concord              full scene
http://127.0.0.1:7420/concord-widget       corner plate, same poll
http://127.0.0.1:7420/interval?transparent=1
```

### Full and panel

Each card is marked one or the other, and it tells you how to place it.

- **full** — the overlay _is_ the scene. A rite, an interval card. Give it the
  whole canvas.
- **panel** — furniture composited over gameplay or a DAW capture. Add
  `?transparent=1` so it sits on what is behind it.

### Guides

Append `?guides=1` to any address to draw its safe area while you position it.
Remove it before going live.

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

| Knob          | Range     | What it moves                                      |
| ------------- | --------- | -------------------------------------------------- |
| **Scale**     | 0.5–2.0×  | The whole layout                                    |
| **Type size** | 0.5–2.0×  | Text only, on top of scale. Spacing follows the type |
| **Opacity**   | 10–100%   | The whole surface                                  |

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

|            | INTERVAL                         | CONVENING                 |
| ---------- | -------------------------------- | ------------------------- |
| For        | Breaks and segments              | Opening a broadcast       |
| Past zero  | Counts a grace period in crimson | Resolves to a single word |
| Audio cues | One minute, and final call       | Silent by default         |

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

| Setting          | What it does                                              |
| ---------------- | --------------------------------------------------------- |
| **Title**        | The marque, set low and left. Uppercased                   |
| **Second line**  | A quieter line beneath it                                  |
| **Band width**   | The share of the frame held for a chat capture. Zero removes it |
| **Top / lower colour** | The two stops of the band’s gradient                 |
| **Band strength**| How present the band is overall                            |

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
