# THE CHORUS

Chat as an institutional register, for the **Streamlabs Chat Box** widget.

Numbered entries, a continuous measured line between name and message, and
exactly one crimson mark on screen — always on the newest arrival. Built in the
same visual language as the served overlays (THE CONCORD, the Resonance
Selection), so a scene that mixes them reads as one system.

```
      0147    VELVETIRIS │ harmony is maintained, operator
      0148      KORVAN_9 │ that ring looked unreal on stream
  ▍   0149     SIL_TAA__ │ the newest entry carries the mark, alone
```

---

## Getting it in

The easiest route is from inside the app: **OBSERVATORY → THE CHORUS**. Set the
options, watch the preview, copy each block. The settings are baked into the
code you copy, so nothing needs configuring on the Streamlabs side.

To do it by hand, paste these files into the widget editor's tabs:

| Tab    | File          | Required |
| ------ | ------------- | -------- |
| HTML   | `widget.html` | yes      |
| CSS    | `widget.css`  | yes      |
| JS     | `widget.js`   | yes      |
| Fields | `fields.json` | optional |

Then in OBS: **Browser source → 640 × 900**, background transparent.

`fields.json` only adds Streamlabs-side controls for the same settings. Skip it
if you configure from the app; add it if you would rather change the preset in
the Streamlabs panel than come back here. When both exist, Streamlabs wins —
`onLoad` merges its field data over the baked-in defaults.

If you paste `widget.css` by hand rather than from the app, the four Streamlabs
placeholders (`background_color`, `text_color`, `font_size`,
`message_hide_delay`) stay in it and Streamlabs fills them itself.

---

## Settings

| Setting         | Default    | What it does                                                                          |
| --------------- | ---------- | ------------------------------------------------------------------------------------- |
| Preset          | `obsidian` | OBSIDIAN (void), SANCTUM (crimson glass), CHAMBER (pale stone, for light captures)    |
| Live mark       | `crimson`  | Which material marks the newest entry. Gold, for scenes already carrying a lot of red |
| Name column     | `30%`      | Width of the name side of the ledger                                                  |
| Hold            | `60s`      | How long a message stays before it retires                                            |
| Entry numbers   | on         | The numbered-sections rule, applied to a live feed                                    |
| Roll numbers    | on         | Numerals settle like an odometer instead of appearing                                 |
| Masthead        | on         | Turning sigil and the register's name along the foot                                  |
| Ambient motion  | on         | The sigil, resonance line and arrival scan. Off leaves only messages moving           |
| Brass badges    | on         | Brings Twitch badges into the palette                                                 |
| Stamp deletions | on         | Deleted messages become `EXPUNGED` rather than vanishing                              |

---

## Decisions worth knowing about

**Viewer name colours are remapped, not passed through.** Twitch colours are
overwhelmingly blue, green and purple, and binding `{color}` straight into the
template would put a sixth hue on screen on the first message. Instead the
widget reads the _hue_ of whatever the viewer chose and maps it onto one of
seven in-palette tones; viewers who never set a colour are hashed by name. Both
are deterministic, so a regular looks the same tonight as last week. The
recognition survives; the hue does not.

**Emotes are untouched, including 7TV/BTTV/FFZ.** No filter, full fidelity.
Whether third-party emotes appear at all is a **Streamlabs Chat Box setting**,
not something this widget controls — turn on the 7TV / BetterTTV / FrankerFaceZ
toggles in the widget settings and Streamlabs injects them into the message. The
CSS handles both markup shapes Streamlabs uses (a `span.emote` carrying a
background image, and a bare `img.emote`), and leaves width on `auto` so the
wide emotes those services are full of are not squashed. Emotes are speech rather
than architecture — the reference boards are full of crimson-robed figures, and
colour belonging to the crowd was never what the palette rule was guarding
against. Badges are treated the other way, as issued insignia, and get plated in
brass. Turn that off with `brass_badges` if you disagree.

**Only one thing is ever crimson.** The newest entry's numeral and tick. When a
newer message lands the mark moves, decaying to gold over ~560ms rather than
snapping, so it reads as travelling down the register. The arrival scan under
each message is deliberately _gold_, not crimson: several overlap in fast chat,
and a second crimson object on screen would break the rule the whole design is
built on.

**No grain, no vignette.** The console wears both. A film-grain layer on top of
a live stream is noise on top of noise, and OBS composites the scene anyway —
the same call the in-app overlays already made.

**`display: table` is kept from the stock widget.** It is the right tool: a
right-aligned name column beside an independently wrapping message column. CSS
Grid cannot replace it here — rows would need `display: contents`, which
generates no box, and a row with no box cannot be faded in or out. Per-row
opacity is the whole widget.

---

## Working on it locally

Open `preview.html` in any browser. No server, no Streamlabs account. It links
the real `widget.css` and `widget.js` rather than copies, simulates a chat
stream, and has buttons for the three presets, the accent, and expunging a
message.

The stylesheet declares each placeholder-carrying property twice — a `var()`
fallback first, the placeholder second. Streamlabs substitutes and the second
wins; anywhere else the placeholder is not valid CSS, so that one declaration is
discarded and the fallback stands. That is what lets one file serve the live
widget, the local preview and the app's generator without three copies drifting
apart.

`widget.css` is in `.prettierignore` for the same reason — no CSS parser can
read a file with placeholders where values belong. Keep its formatting by hand.
`widget.js` is in the ESLint ignores: it is plain browser ES5 for someone else's
runtime, written that way deliberately.
