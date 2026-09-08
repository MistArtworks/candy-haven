import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ConsoleLayout } from '@renderer/layouts/ConsoleLayout'
import { NexusPage } from '@renderer/features/home/NexusPage'
import { ArchivePage } from '@renderer/features/archive/ArchivePage'
import { RegulationPage } from '@renderer/features/regulation/RegulationPage'
import { TelemetryPage } from '@renderer/features/telemetry/TelemetryPage'
import { ReservedPage } from '@renderer/features/reserved/ReservedPage'

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

        <Route
          path="/observatory"
          element={
            <ReservedPage
              sectionId="observatory"
              scope={[
                'Compose and manage stream overlay scenes',
                'Serve overlays to OBS via a local browser source',
                'Bind overlay state to live data from the archive',
                'Switch scenes and trigger transitions during broadcast',
                'Record broadcast telemetry for post-stream review'
              ]}
            />
          }
        />

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
