import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ConsoleLayout } from '@renderer/layouts/ConsoleLayout'
import { NexusPage } from '@renderer/features/home/NexusPage'
import { ArchivePage } from '@renderer/features/archive/ArchivePage'
import { ObservatoryPage } from '@renderer/features/observatory/ObservatoryPage'
import { SelectionPage } from '@renderer/features/observatory/overlays/selection/SelectionPage'
import { ReservedOverlayPage } from '@renderer/features/observatory/overlays/ReservedOverlayPage'
import { RegulationPage } from '@renderer/features/regulation/RegulationPage'
import { TelemetryPage } from '@renderer/features/telemetry/TelemetryPage'
import { ReservedPage } from '@renderer/features/reserved/ReservedPage'
import { OVERLAYS } from '@shared/domain/overlays'

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
export function AppRouter(): ReactNode {
  return (
    <Routes>
      <Route element={<ConsoleLayout />}>
        <Route index element={<NexusPage />} />

        <Route path="/archive" element={<ArchivePage />} />

        <Route
          path="/transmissions"
          element={
            <ReservedPage
              sectionId="transmissions"
              scope={[
                'Lay every release and promotional deliverable onto one calendar',
                'Surface what goes out today, this week and before the next release',
                'Warn on collisions: two releases or two posts on the same day',
                'Track submission windows and distributor lead times',
                'Read its dates from the ARCHIVE promotional plans rather than duplicating them'
              ]}
            />
          }
        />

        {/*
          OBSERVATORY is a catalogue with one route per overlay. Every entry in
          the registry is routed whether or not it is built — a reserved one
          resolves to its scope page — so a catalogue card is never a dead link.
          Shipping an overlay means adding its case below and flipping
          `implemented` in shared/domain/overlays.ts.
        */}
        <Route path="/observatory">
          <Route index element={<ObservatoryPage />} />
          {OVERLAYS.map((overlay) => (
            <Route
              key={overlay.id}
              path={overlay.slug}
              element={
                overlay.id === 'selection' ? (
                  <SelectionPage />
                ) : (
                  <ReservedOverlayPage overlayId={overlay.id} />
                )
              }
            />
          ))}
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
