import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { RuntimeInfo } from '@shared/domain/system'

/**
 * Request/response data goes through React Query; server-pushed state goes
 * through the system store. Runtime info is immutable for the life of the
 * process, so it is fetched once and never refetched.
 */
export function useRuntimeInfo(): UseQueryResult<RuntimeInfo> {
  return useQuery({
    queryKey: ['runtime', 'info'],
    queryFn: () => window.candy.runtime.info(),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false
  })
}
