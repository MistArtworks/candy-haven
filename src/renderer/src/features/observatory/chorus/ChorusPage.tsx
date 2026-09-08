import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { OVERLAYS } from '@shared/domain/overlays'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { Slider } from '@renderer/components/primitives/Slider'
import { Checkbox, SelectInput, TextInput } from '@renderer/components/primitives/Input'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import { gridVariants } from '@renderer/motion/transitions'
import {
  CHORUS_ACCENTS,
  CHORUS_DEFAULTS,
  CHORUS_PRESETS,
  CHORUS_PRESET_LABEL,
  chorusCss,
  chorusFields,
  chorusHtml,
  chorusJs,
  chorusPreviewDocument,
  type ChorusConfig
} from './chorus.generate'
import styles from './ChorusPage.module.scss'

/**
 * THE CHORUS — the Streamlabs chat widget, configured and emitted.
 *
 * The one page in OBSERVATORY that does not drive a browser source. Streamlabs
 * hosts its own chat widget and will not load a source from us, so the console
 * cannot run this overlay — it can only hand over the code, and the useful
 * thing it can do is hand over code that is already configured.
 *
 * Hence the shape: controls on the left, a live preview as the focal object,
 * and the three artefacts underneath with a copy button each. Nothing is saved.
 * The output is the artefact, and the operator has already pasted it into
 * Streamlabs by the time any persisted setting would matter — storing it would
 * only create a second place for the configuration to live, one of which would
 * be wrong the moment they edited the other.
 */
export function ChorusPage(): ReactNode {
  const [config, setConfig] = useState<ChorusConfig>(CHORUS_DEFAULTS)
  const [copied, setCopied] = useState<string | null>(null)
  // Bumping this remounts the frame, which replays the entrance animations —
  // the motion is the part hardest to judge from a still.
  const [replay, setReplay] = useState(0)

  function update<K extends keyof ChorusConfig>(key: K, value: ChorusConfig[K]): void {
    setConfig((previous) => ({ ...previous, [key]: value }))
  }

  const css = useMemo(() => chorusCss(config), [config])
  const js = useMemo(() => chorusJs(config), [config])
  const html = useMemo(() => chorusHtml(), [])
  const fields = useMemo(() => chorusFields(), [])
  const preview = useMemo(() => chorusPreviewDocument(config), [config])

  const copy = (key: string, value: string): void => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1600)
    })
  }

  const artefacts = [
    { key: 'html', label: 'HTML', hint: 'Layout and the chat item template', body: html },
    {
      key: 'css',
      label: 'CSS',
      hint: 'Palette, ledger, motion — your settings baked in',
      body: css
    },
    { key: 'js', label: 'JS', hint: 'Numbering, the live mark, name tones', body: js },
    {
      key: 'fields',
      label: 'Fields',
      hint: 'Optional — lets you change these settings inside Streamlabs instead',
      body: fields
    }
  ]

  return (
    <div className={styles.page}>
      <PageHeader
        index={OVERLAYS.length + 1}
        label="THE CHORUS"
        purpose="Chat as an institutional register, for the Streamlabs chat widget"
        epigraph="Many forms, one song."
        actions={
          <div className={styles.headerActions}>
            <Link to="/observatory" className={styles.back}>
              Catalogue
            </Link>
            <StatusDot tone="pending" label="Pasted, not served" />
          </div>
        }
      />

      <motion.div
        className={styles.grid}
        variants={gridVariants}
        initial="initial"
        animate="animate"
      >
        {/* The preview is the single focal object on this page, per the brief. */}
        <Panel
          label="Broadcast preview"
          index="01"
          focal
          className={styles.span4}
          aside={
            <Button size="sm" variant="ghost" onClick={() => setReplay((value) => value + 1)}>
              Replay
            </Button>
          }
        >
          <div className={styles.stage}>
            <iframe
              key={`${replay}-${config.preset}-${config.accent}`}
              className={styles.frame}
              title="THE CHORUS preview"
              sandbox=""
              srcDoc={preview}
            />
            <span className={styles.stageLabel}>Simulated scene · 640 × 900 source</span>
          </div>
          <p className={styles.hint}>
            Viewer colours here are deliberately hostile — Twitch blue, green, purple and pink, plus
            two viewers with no colour set. Every name still resolves to one of the seven in-palette
            tones. The fourth entry shows a deleted message.
          </p>
        </Panel>

        <Panel label="Presentation" index="02" className={styles.span2}>
          <div className={styles.controls}>
            <SelectInput
              label="Preset"
              value={config.preset}
              options={CHORUS_PRESETS.map((preset) => ({
                value: preset,
                label: CHORUS_PRESET_LABEL[preset]
              }))}
              onChange={(value) => update('preset', value)}
              hint="The same three arrangements the served overlays offer."
            />

            <SelectInput
              label="Live mark"
              value={config.accent}
              options={CHORUS_ACCENTS.map((accent) => ({
                value: accent,
                label: accent === 'crimson' ? 'Crimson glass' : 'Brushed gold'
              }))}
              onChange={(value) => update('accent', value)}
              hint="Carried by the newest entry alone."
            />

            <Slider
              label="Name column"
              value={config.nameWidth}
              min={18}
              max={48}
              onChange={(value) => update('nameWidth', value)}
              readout={`${config.nameWidth}%`}
            />

            <Slider
              label="Font size"
              value={config.fontSize}
              min={12}
              max={40}
              onChange={(value) => update('fontSize', value)}
              readout={`${config.fontSize}px`}
            />

            <Slider
              label="Hold"
              value={config.hideDelay}
              min={0}
              max={300}
              step={5}
              onChange={(value) => update('hideDelay', value)}
              readout={config.hideDelay === 0 ? 'Never fades' : `${config.hideDelay}s`}
              hint="How long a message stays before it retires."
            />

            <TextInput
              label="Backdrop"
              value={config.background}
              onChange={(value) => update('background', value)}
              hint="transparent is correct for OBS — the scene shows through."
              mono
            />
          </div>
        </Panel>

        <Panel label="Register" index="03" className={styles.span2}>
          <div className={styles.controls}>
            <Checkbox
              label="Entry numbers"
              checked={config.showIndex}
              onChange={(value) => update('showIndex', value)}
              hint="Numbered sections, applied to a live feed."
            />
            <Checkbox
              label="Roll numbers into place"
              checked={config.numeralRoll}
              onChange={(value) => update('numeralRoll', value)}
              hint="Settles like an odometer rather than appearing."
            />
            <Checkbox
              label="Masthead"
              checked={config.showMasthead}
              onChange={(value) => update('showMasthead', value)}
              hint="Turning sigil and the register's name, along the foot."
            />
            <Checkbox
              label="Ambient motion"
              checked={config.ambientMotion}
              onChange={(value) => update('ambientMotion', value)}
              hint="The sigil, the resonance line and the arrival scan. Off leaves only messages moving."
            />
            <Checkbox
              label="Brass-plate badges"
              checked={config.brassBadges}
              onChange={(value) => update('brassBadges', value)}
              hint="Brings Twitch badges into the palette. Emotes are never filtered."
            />
            <Checkbox
              label="Stamp deletions EXPUNGED"
              checked={config.expungeRecords}
              onChange={(value) => update('expungeRecords', value)}
              hint="Leaves the numeral and strikes the content. Off hides the row entirely."
            />

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfig(CHORUS_DEFAULTS)}
              disabled={JSON.stringify(config) === JSON.stringify(CHORUS_DEFAULTS)}
            >
              Restore defaults
            </Button>
          </div>
        </Panel>

        <Panel
          label="Delivery"
          index="04"
          className={styles.span6}
          aside={
            <span className={styles.asideNote}>Streamlabs → Chat Box → Custom HTML/CSS/JS</span>
          }
        >
          <p className={styles.hint}>
            Paste each block into the matching tab, then save. The Fields block is optional — it
            only adds Streamlabs-side controls for the same settings, which is useful if you would
            rather change the preset there than come back here.
          </p>

          <div className={styles.artefacts}>
            {artefacts.map((artefact) => (
              <section key={artefact.key} className={styles.artefact}>
                <header className={styles.artefactHead}>
                  <span className={styles.artefactLabel}>{artefact.label}</span>
                  <span className={styles.artefactRule} aria-hidden="true" />
                  <span className={styles.artefactHint}>{artefact.hint}</span>
                  <Button size="sm" onClick={() => copy(artefact.key, artefact.body)}>
                    {copied === artefact.key ? 'Copied' : 'Copy'}
                  </Button>
                </header>
                <pre className={styles.code}>{artefact.body}</pre>
              </section>
            ))}
          </div>
        </Panel>
      </motion.div>
    </div>
  )
}
