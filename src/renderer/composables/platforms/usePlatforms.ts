import { useMutation, useQuery } from '@tanstack/vue-query'
import { useUser } from '../user/useUser'
import { queryClient } from 'src/renderer/query/queryClient'
import { ipcService } from 'src/ipc/renderer'
import { PlatformAccountData, PlatformType } from 'src/database/platform-account'
import { computed, MaybeRef, toValue } from 'vue'
import { ChessGame } from 'src/database/chess/types'

const createPlatformQueryKey = (userId?: number) => {
  // if (!userId) {
  //   throw new Error('userId is required')
  // }
  return ['platforms', userId] as const
}

const getPlatforms = async (userId?: number) => {
  if (!userId) {
    throw new Error('userId is required')
  }
  const platforms = await ipcService.send('platform:getByUserId', { userId })
  return platforms
}

const createPlatform = async (options: {
  userId: number
  platform: PlatformType
  platformUsername: string
}) => {
  const platform = await ipcService.send('platform:create', options)
  return platform
}

const updatePlatform = async (options: {
  id: number
  updates: Partial<Omit<PlatformAccountData, 'id' | 'userId' | 'createdAt'>>
}) => {
  const platform = await ipcService.send('platform:update', options)
  return platform
}

export const usePlatforms = () => {
  const { user } = useUser()
  const userId = computed(() => user.value?.id)
  const userPlatformQueryKey = computed(() => createPlatformQueryKey(userId.value))
  const enabled = computed(() => !!userId.value)

  const {
    data: platformsData,
    error: platformsError,
    isLoading: isPlatformsLoading,
    isFetching: isPlatformsFetching,
    isRefetching: isPlatformsRefetching,
  } = useQuery(
    {
      queryKey: userPlatformQueryKey,
      queryFn: () => getPlatforms(userId.value),
      enabled,
    },
    queryClient
  )

  const {
    mutate: createPlatformMutation,
    isPending: isCreatingPlatform,
    isSuccess: isPlatformCreated,
    isError: isPlatformCreationError,
    error: platformCreationError,
  } = useMutation(
    {
      mutationFn: (options: { platform: PlatformType; platformUsername: string }) => {
        if (!userId.value) {
          throw new Error('userId is required')
        }
        return createPlatform({
          userId: userId.value,
          platform: options.platform,
          platformUsername: options.platformUsername,
        })
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: userPlatformQueryKey.value })
      },
    },
    queryClient
  )

  const {
    mutate: updatePlatformMutation,
    isPending: isUpdatingPlatform,
    isSuccess: isPlatformUpdated,
    isError: isPlatformUpdateError,
    error: platformUpdateError,
  } = useMutation(
    {
      mutationFn: (updates: Partial<Omit<PlatformAccountData, 'id' | 'userId' | 'createdAt'>>) => {
        if (!userId.value) {
          throw new Error('userId is required')
        }
        return updatePlatform({ id: userId.value, updates })
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: userPlatformQueryKey.value })
      },
    },
    queryClient
  )

  const platforms = computed(() => platformsData.value ?? [])

  const getPlatformNameForGame = (game?: MaybeRef<ChessGame | null | undefined>) => {
    if (!game) return null
    const gameValue = toValue(game)
    if (gameValue == null) return null
    return (
      platforms.value.find(platform => platform.platform === gameValue.platform)
        ?.platformUsername ?? null
    )
  }

  return {
    platforms,
    platformsError,
    isPlatformsLoading,
    isPlatformsFetching,
    isPlatformsRefetching,

    createPlatformMutation,
    isCreatingPlatform,
    isPlatformCreated,
    isPlatformCreationError,
    platformCreationError,

    updatePlatformMutation,
    isUpdatingPlatform,
    isPlatformUpdated,
    isPlatformUpdateError,
    platformUpdateError,

    getPlatformNameForGame,
  }
}

export const prefetchPlatforms = async (userId?: number): Promise<PlatformAccountData[]> => {
  if (!userId) {
    return []
  }
  await queryClient.prefetchQuery({
    queryKey: createPlatformQueryKey(userId),
    queryFn: () => getPlatforms(userId),
  })

  return queryClient.getQueryData(createPlatformQueryKey(userId)) ?? []
}
