import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ConsoleLayout } from '@renderer/layouts/ConsoleLayout'
import { NexusPage } from '@renderer/features/home/NexusPage'
import { ArchivePage } from '@renderer/features/archive/ArchivePage'
// Plural, and not to be confused with the singular `TransmissionPage` imported
// below — that one is the NOW TRANSMITTING overlay's host page. This is the
// scheduling department.
import { TransmissionsPage } from '@renderer/features/transmissions/TransmissionsPage'
import { ObservatoryPage } from '@renderer/features/observatory/ObservatoryPage'
import { SelectionPage } from '@renderer/features/observatory/overlays/selection/SelectionPage'
import { ConcordPage } from '@renderer/features/observatory/overlays/concord/ConcordPage'
import { ReservedOverlayPage } from '@renderer/features/observatory/overlays/ReservedOverlayPage'
import { ChorusPage } from '@renderer/features/observatory/chorus/ChorusPage'
import { TimerPage } from '@renderer/features/observatory/overlays/timer/TimerPage'
import { TransmissionPage } from '@renderer/features/observatory/overlays/transmission/TransmissionPage'
import { RegulationPage } from '@renderer/features/regulation/RegulationPage'
import { TelemetryPage } from '@renderer/features/telemetry/TelemetryPage'
import { ReservedPage } from '@renderer/features/reserved/ReservedPage'
import { OVERLAYS, type OverlayId } from '@shared/domain/overlays'

/**
 * Route table.
 *
 * Every section declared in the shared navigation registry is routed, including
 * those not yet commissioned — they resolve to a reserved-state page. When a
 * feature ships, its route swaps to the real page and `implemented` flips in
 * shared/domain/navigation.ts; nothing else changes.
 *
 * Routes are declared eagerly rather than lazily: this is a desktop app loading
 * from local disk, so code-splitting would add a loading state without
 * meaningfully improving startup.
 */
/**
 * The page an overlay's sub-route resolves to.
 *
 * A switch rather than the chain of ternaries this used to be: with five
 * overlays shipped, adding one meant reading four conditions to work out where
 * it belonged, and the nesting had started to obscure that the two countdowns
 * deliberately share a page.
 *
 * The `default` is load-bearing and not a fallback for a missing case — an
 * overlay that has not shipped resolves to its own scope page, so declaring a
 * new one in the registry routes it somewhere sensible before a line of its
 * implementation exists.
 */
function overlayElement(id: OverlayId): ReactNode {
  switch (id) {
    case 'selection':
      return <SelectionPage />
    case 'concord':
      return <ConcordPage />
    case 'transmission':
      return <TransmissionPage />
    // Both countdowns share a page; the id selects the timer.
    case 'interval':
    case 'convene':
      return <TimerPage timerId={id} />
    default:
      return <ReservedOverlayPage overlayId={id} />
  }
}

export function AppRouter(): ReactNode {
  return (
    <Routes>
      <Route element={<ConsoleLayout />}>
        <Route index element={<NexusPage />} />

        <Route path="/archive" element={<ArchivePage />} />

        <Route path="/transmissions" element={<TransmissionsPage />} />

        {/*
          OBSERVATORY is a catalogue with one route per overlay. Every entry in
          the registry is routed whether or not it is built — a reserved one
          resolves to its scope page — so a catalogue card is never a dead link.
          Shipping an overlay means adding its case to `overlayElement` and
          flipping `implemented` in shared/domain/overlays.ts.
        */}
        <Route path="/observatory">
          <Route index element={<ObservatoryPage />} />
          {OVERLAYS.map((overlay) => (
            <Route key={overlay.id} path={overlay.slug} element={overlayElement(overlay.id)} />
          ))}

          {/*
            THE CHORUS is routed by hand rather than from the registry, because
            it is not one of its members. Every entry in `OVERLAYS` is a browser
            source this app serves and builds a document for — the registry
            drives the server's URL table and Vite's entry points off exactly
            that assumption. The Chorus is a Streamlabs widget: we emit its code
            and Streamlabs hosts it. Declaring it there would ask the build for a
            document that does not exist.
          */}
          <Route path="chorus" element={<ChorusPage />} />
        </Route>

        <Route
          path="/interface"
          element={
            <ReservedPage
              sectionId="interface"
              scope={[
                'Accept natural-language instructions describing an intended change',
                'Resolve each instruction into concrete, reviewable operations',
                'Preview every mutation before it is applied to the archive',
                'Execute approved operations across projects, releases and overlays',
                'Retain a full, reversible history of issued commands'
              ]}
            />
          }
        />

        <Route path="/telemetry" element={<TelemetryPage />} />

        <Route path="/regulation" element={<RegulationPage />} />

        {/* Unknown paths return to the Nexus rather than dead-ending. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
