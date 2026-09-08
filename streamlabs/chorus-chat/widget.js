/* =========================================================================
   THE CHORUS — Streamlabs chat widget · Candy Haven / Sonoalchemy
   Paste into the widget editor's JS tab.

   Four jobs, none of which CSS can do alone:

     1. Stamp each arriving message with a sequence number.
     2. Roll that number into place like a mechanical counter.
     3. Move the single crimson "live" mark onto the newest entry.
     4. Map the viewer's Twitch colour into the locked palette.

   Everything else is styling and lives in widget.css.

   The work is driven by a MutationObserver rather than by `onEventReceived`.
   Streamlabs renders chat items itself from the #chatlist_item template, so the
   event handler fires alongside rendering rather than as part of it — observing
   the DOM is what guarantees every row that actually appears gets numbered,
   including any the widget injects on its own (history replay, re-renders).
   ========================================================================= */

;(function () {
  'use strict'

  /* ----------------------------------------------------------------- CONFIG

     The console's generator rewrites exactly this block, between the markers,
     when it emits a configured copy of the widget. Keeping the whole
     configuration in one object literal on one contiguous span is what makes
     that a safe textual substitution rather than a parse-and-patch.

     Leave the markers in place if you edit by hand — without them the generator
     falls back to appending an override, which still works but is less tidy. */

  /* CHORUS:CONFIG */
  var DEFAULTS = {
    preset: 'obsidian',
    accent: 'crimson',
    name_width: 30,
    show_index: true,
    show_masthead: true,
    brass_badges: true,
    expunge_records: true,
    numeral_roll: true,
    ambient_motion: true
  }
  /* CHORUS:CONFIG-END */

  /** Number of in-palette tone slots. Must match --ch-name-1..7 in widget.css. */
  var TONE_COUNT = 7

  /** Wraps at 10000 so the column never outgrows its width. */
  var SEQUENCE_WRAP = 10000

  var ordinal = 0
  var liveRow = null
  var settings = DEFAULTS

  var prefersStill =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // ------------------------------------------------------------------ colour

  /**
   * Hue and saturation of a hex colour, or null if it is not one.
   *
   * Only hue survives the trip. The viewer's *choice* is what carries identity —
   * two regulars who picked different colours should stay distinguishable — but
   * their lightness and saturation are theirs, and honouring those is exactly
   * how a neon Twitch green would end up on screen.
   */
  function hueOf(value) {
    if (typeof value !== 'string') return null

    var hex = value.trim()
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null

    if (hex.length === 4) {
      hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
    }

    var r = parseInt(hex.slice(1, 3), 16) / 255
    var g = parseInt(hex.slice(3, 5), 16) / 255
    var b = parseInt(hex.slice(5, 7), 16) / 255

    var max = Math.max(r, g, b)
    var min = Math.min(r, g, b)
    var delta = max - min

    if (delta === 0) return { hue: 0, saturation: 0 }

    var hue
    if (max === r) hue = ((g - b) / delta) % 6
    else if (max === g) hue = (b - r) / delta + 2
    else hue = (r - g) / delta + 4

    hue *= 60
    if (hue < 0) hue += 360

    var lightness = (max + min) / 2
    var denominator = 1 - Math.abs(2 * lightness - 1)
    var saturation = denominator === 0 ? 0 : delta / denominator

    return { hue: hue, saturation: saturation }
  }

  /** Stable hash, for viewers who never set a colour. */
  function hashOf(text) {
    var hash = 0
    for (var i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) >>> 0
    }
    return hash
  }

  /**
   * Which of the seven palette tones this viewer gets.
   *
   * Hue when they chose a colour, name-hash when they did not or when what they
   * chose is greyscale (no hue to read). Both are deterministic, so a regular
   * looks the same tonight as they did last stream — the point of viewer colour
   * is recognition, and recognition is the part worth keeping.
   */
  function toneFor(colour, name) {
    var hs = hueOf(colour)

    if (hs && hs.saturation >= 0.15) {
      return (Math.floor((hs.hue / 360) * TONE_COUNT) % TONE_COUNT) + 1
    }

    return (hashOf(String(name).toLowerCase()) % TONE_COUNT) + 1
  }

  // ---------------------------------------------------------------- numerals

  function pad(value) {
    var text = String(value)
    while (text.length < 4) text = '0' + text
    return text
  }

  /**
   * Settles the numeral like an odometer coming to rest.
   *
   * Five frames of noise then the real value — long enough to read as mechanism
   * and short enough that the number is correct before anyone has focused on it.
   * The register is meant to feel operated rather than rendered.
   */
  function roll(element, finalText) {
    if (!settings.numeral_roll || prefersStill) {
      element.textContent = finalText
      return
    }

    var frame = 0
    var total = 5

    ;(function step() {
      if (frame >= total || !element.isConnected) {
        element.textContent = finalText
        return
      }
      frame++
      element.textContent = pad(Math.floor(Math.random() * SEQUENCE_WRAP))
      setTimeout(step, 42)
    })()
  }

  // ------------------------------------------------------------------- rows

  function commit(row) {
    if (!row || row.nodeType !== 1 || row.dataset.chorus === 'seated') return
    row.dataset.chorus = 'seated'

    ordinal = (ordinal + 1) % SEQUENCE_WRAP

    var index = row.querySelector('.index')
    if (index) roll(index, pad(ordinal))

    // Exactly one crimson mark exists at any moment. Clearing the previous one
    // before setting the new is what makes that true rather than nearly true.
    if (liveRow && liveRow !== row) liveRow.classList.remove('is-live')
    row.classList.add('is-live')
    liveRow = row

    row.setAttribute(
      'data-tone',
      String(toneFor(row.getAttribute('data-color'), row.getAttribute('data-from') || ''))
    )
  }

  function watch(log) {
    Array.prototype.forEach.call(log.children, commit)

    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes
        for (var j = 0; j < added.length; j++) {
          if (added[j].parentNode === log) commit(added[j])
        }
      }
    }).observe(log, { childList: true })
  }

  // --------------------------------------------------------------- settings

  /**
   * Presentation is carried on <html> as data attributes, exactly as the app
   * drives its own runtime theming. It keeps every colour decision inside the
   * stylesheet — which is what lets CHAMBER invert the name tones for a light
   * capture without this file knowing that light presets exist.
   */
  function apply(field) {
    var data = field || {}
    var merged = {}
    var key

    for (key in DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
        merged[key] = Object.prototype.hasOwnProperty.call(data, key) ? data[key] : DEFAULTS[key]
      }
    }
    settings = merged

    var root = document.documentElement
    root.setAttribute('data-theme', merged.preset || 'obsidian')
    root.setAttribute('data-accent', merged.accent || 'crimson')
    root.setAttribute('data-index', merged.show_index === false ? 'off' : 'on')
    root.setAttribute('data-badges', merged.brass_badges === false ? 'native' : 'brass')
    root.setAttribute('data-expunge', merged.expunge_records === false ? 'hide' : 'stamp')
    root.setAttribute('data-masthead', merged.show_masthead === false ? 'off' : 'on')
    root.setAttribute('data-motion', merged.ambient_motion === false ? 'still' : 'full')

    if (merged.name_width) {
      root.style.setProperty('--ch-name-width', merged.name_width + '%')
    }
  }

  // ------------------------------------------------------------------- boot

  // Defaults are applied immediately rather than waiting for onLoad. The widget
  // is visible the moment it is mounted, and an unstyled frame on a live scene
  // is worse than a frame styled from defaults that onLoad then corrects.
  apply(null)

  var log = document.getElementById('log')
  if (log) watch(log)

  document.addEventListener('onLoad', function (obj) {
    apply(obj && obj.detail ? obj.detail.fieldData : null)

    if (!log) {
      log = document.getElementById('log')
      if (log) watch(log)
    }
  })

  document.addEventListener('onEventReceived', function () {
    // Intentionally empty. Rendering is Streamlabs' job and numbering is the
    // observer's; there is nothing this handler would do that is not already
    // done, and doing it here as well would double-count every message.
  })

  // Exposed only so preview.html can drive the same code path the live widget
  // uses, rather than reimplementing it and testing something else.
  window.CHORUS = { apply: apply, commit: commit }
})()
