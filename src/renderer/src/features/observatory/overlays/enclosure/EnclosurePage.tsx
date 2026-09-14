import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { getOverlay, overlaySourceUrl } from '@shared/domain/overlays'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import { Checkbox, TextInput } from '@renderer/components/primitives/Input'
import { gridVariants } from '@renderer/motion/transitions'
import { useOverlayInfo } from '@renderer/hooks/useRite'
import styles from './EnclosurePage.module.scss'

const MARQUE_LIMIT = 32
const SECTION_LIMIT = 8

/**
 * Host surface for THE ENCLOSURE.
 *
 * A composer rather than a control panel, and the distinction is the whole
 * design: the frame holds no state in the main process, so there is nothing
 * here to start, stop or push. What the operator builds on this page is an
 * *address*, and pasting it into OBS is what applies it.
 *
 * That is why nothing is saved. A setting that lived in the database would have
 * to be pushed to every source at once, which is the opposite of what a frame
 * wants — two scenes can carry two enclosures with different marques, and the
 * address is what tells them apart.
 */
export function EnclosurePage(): ReactNode {
  const overlay = getOverlay('enclosure')
  const server = useOverlayInfo()

  const [marque, setMarque] = useState('CANDY HEIST')
  const [section, setSection] = useState('§01')
  const [air, setAir] = useState(false)
  const [copied, setCopied] = useState(false)

  /*
   * Built rather than declared, because the address is the configuration.
   *
   * `transparent` is pinned on rather than offered as a choice: a frame that
   * paints its own background would hide the capture it is supposed to dress,
   * so there is no useful setting to expose.
   */
  const sourceUrl = useMemo(() => {
    if (!server.url) return null

    const url = new URL(overlaySourceUrl(server.url, overlay, { transparent: true }))
    const trimmedMarque = marque.trim()
    const trimmedSection = section.trim()

    if (trimmedMarque) url.searchParams.set('marque', trimmedMarque)
    if (trimmedSection) url.searchParams.set('section', trimmedSection)
    if (air) url.searchParams.set('air', '1')

    return url.toString()
  }, [server.url, overlay, marque, section, air])

  const guidesUrl = useMemo(() => {
    if (!sourceUrl) return null
    const url = new URL(sourceUrl)
    url.searchParams.set('guides', '1')
    return url.toString()
  }, [sourceUrl])

  function copyUrl(): void {
    if (!sourceUrl) return
    void navigator.clipboard.writeText(sourceUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

  // Mirrors what main.ts does to the same values, so the preview cannot claim a
  // frame the browser source would not draw.
  const shownMarque = (marque.trim() || 'CANDY HEIST').slice(0, MARQUE_LIMIT).toUpperCase()
  const shownSection = (section.trim() || '§01').slice(0, SECTION_LIMIT).toUpperCase()

  return (
    <div className={styles.page}>
      <PageHeader
        index={overlay.order + 1}
        label={overlay.label}
        purpose={overlay.purpose}
        epigraph={overlay.epigraph}
        actions={
          <div className={styles.headerActions}>
            <Link to="/observatory" className={styles.back}>
              Catalogue
            </Link>
            <StatusDot
              tone={air ? 'error' : 'pending'}
              label={air ? 'On air' : 'Dark'}
              pulse={air}
            />
          </div>
        }
      />

      <motion.div
        className={styles.grid}
        variants={gridVariants}
        initial="initial"
        animate="animate"
      >
        {/* The frame is the single focal object on this page. */}
        <Panel
          label="Frame"
          index="01"
          focal
          className={styles.framePanel}
          aside={
            <span className={styles.canvas}>
              {overlay.canvas.width} × {overlay.canvas.height}
            </span>
          }
        >
          <div className={styles.stage} data-air={air || undefined}>
            <span className={`${styles.bracket} ${styles.tl}`} />
            <span className={`${styles.bracket} ${styles.tr}`} />
            <span className={`${styles.bracket} ${styles.bl}`} />
            <span className={`${styles.bracket} ${styles.br}`} />

            <div className={styles.plinth}>
              <span className={styles.pip} />
              <span className={styles.marque}>{shownMarque}</span>
              <span className={styles.air}>ON AIR</span>
              <span className={styles.section}>{shownSection}</span>
            </div>
          </div>

          <p className={styles.hint}>
            The centre is fully transparent. What shows through it is whatever the scene puts behind
            this source.
          </p>
        </Panel>

        <Panel label="Marque" index="02" className={styles.span3}>
          <div className={styles.fields}>
            <TextInput
              label="Marque"
              value={marque}
              onChange={setMarque}
              maxLength={MARQUE_LIMIT}
              placeholder="CANDY HEIST"
              hint={`Uppercased on the frame. ${MARQUE_LIMIT} characters.`}
            />

            <TextInput
              label="Section"
              value={section}
              onChange={setSection}
              maxLength={SECTION_LIMIT}
              placeholder="§01"
              mono
              hint="The numeral at the right of the plinth."
            />

            <Checkbox
              label="Declare the broadcast live"
              checked={air}
              onChange={setAir}
              hint="Lights the crimson pip. It is the only colour on the frame."
            />
          </div>
        </Panel>

        <Panel label="Broadcast" index="03" className={styles.span3}>
          {sourceUrl ? (
            <>
              <p className={styles.hint}>
                Add a Browser source in OBS at this address. Width {overlay.canvas.width}, height{' '}
                {overlay.canvas.height}, and tick <strong>Transparent</strong>. The address carries
                the settings above, so changing one here means pasting the new address rather than
                reloading the source.
              </p>
              <code className={styles.url}>{sourceUrl}</code>
              <div className={styles.broadcastActions}>
                <Button size="sm" variant="ghost" onClick={copyUrl}>
                  {copied ? 'Copied' : 'Copy address'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void window.candy.shell.openExternal(sourceUrl)}
                >
                  Preview
                </Button>
                {guidesUrl ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void window.candy.shell.openExternal(guidesUrl)}
                  >
                    Preview with guides
                  </Button>
                ) : null}
              </div>
            </>
          ) : (
            <p className={styles.hint}>Overlay server offline — no address to serve.</p>
          )}
        </Panel>
      </motion.div>
    </div>
  )
}
