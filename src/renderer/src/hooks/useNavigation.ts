import { useMemo } from 'react'
import { arrangeSections, type Arrangement } from '@shared/domain/navigation'
import { useSettings } from './useSettings'

/**
 * The rail as this operator has arranged it: pins, categories, and each
 * department's number. See `arrangeSections`.
 *
 * Read from settings, so REGULATION's DIRECTORY changes it live while the
 * operator edits, and the console's own arrangement stands until settings
 * have loaded.
 */
export function useNavigation(): Arrangement {
  const navigation = useSettings()?.navigation ?? null
  return useMemo(() => arrangeSections(navigation), [navigation])
}
