import { QueryClient } from '@tanstack/vue-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 2026 Standard: Keep data "fresh" for 1-5 minutes to avoid
      // constant background refetches on window focus.
      staleTime: 5 * 60 * 1000,

      // Keep inactive data in memory for 10 minutes before garbage collection.
      // Note: cacheTime was renamed to gcTime in v5+.
      gcTime: 10 * 60 * 1000,

      // Reduces unnecessary retries on transient network errors.
      retry: 1,

      // Prevents refetching when the user returns to the app
      // if the data is still within its staleTime.
      refetchOnWindowFocus: true,

      // Prefer gating fetches with `enabled` (and stable query keys) so queryFns
      // are not invoked without required inputs — avoids spurious errors under throwOnError.
      throwOnError: true,
    },
  },
})
