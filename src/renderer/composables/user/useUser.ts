import { useMutation, useQuery } from '@tanstack/vue-query'
import { UserData } from 'src/database/models'
import { ipcService } from 'src/ipc/renderer'
import { queryClient } from 'src/renderer/query/queryClient'
import { identifyAppUser } from 'src/services/analytics'

const createUserQueryKey = () => ['user'] as const

export const getSingleAppUser = async () => {
  const user = await ipcService.send('user:getSingleAppUser')
  return user
}

export const createUser = async (options: {
  firstName: string
  lastName: string
  email: string
}) => {
  const user = await ipcService.send('user:create', options)
  return user
}

export const updateUser = async (options: {
  id: number
  updates: Partial<Omit<UserData, 'id' | 'createdAt'>>
}) => {
  const user = await ipcService.send('user:update', options)
  return user
}

export const useUser = () => {
  const {
    data: user,
    error: userError,
    isLoading: isUserLoading,
    isFetching: isUserFetching,
    isRefetching: isUserRefetching,
    isFetched: isUserFetched,
  } = useQuery(
    {
      queryKey: createUserQueryKey(),
      queryFn: getSingleAppUser,
    },
    queryClient
  )

  const {
    mutate: createUserMutation,
    isPending: isCreatingUser,
    isSuccess: isUserCreated,
    isError: isUserCreationError,
    error: userCreationError,
  } = useMutation(
    {
      mutationFn: createUser,
      onSuccess: data => {
        if (data) identifyAppUser(data)
        queryClient.invalidateQueries({ queryKey: ['user'] })
      },
    },
    queryClient
  )

  const {
    mutate: updateUserMutation,
    isPending: isUpdatingUser,
    isSuccess: isUserUpdated,
    isError: isUserUpdateError,
    error: userUpdateError,
  } = useMutation(
    {
      mutationFn: updateUser,
      onSuccess: data => {
        queryClient.invalidateQueries({ queryKey: ['user'] })
      },
    },
    queryClient
  )

  return {
    user,
    userError,
    isUserLoading,
    isUserFetching,
    isUserRefetching,
    isUserFetched,

    createUser: createUserMutation,
    isCreatingUser,
    isUserCreated,
    isUserCreationError,
    userCreationError,

    updateUser: updateUserMutation,
    isUpdatingUser,
    isUserUpdated,
    isUserUpdateError,
    userUpdateError,
  }
}

export const prefetchSingleAppUser = async (): Promise<UserData | null> => {
  await queryClient.prefetchQuery({
    queryKey: createUserQueryKey(),
    queryFn: getSingleAppUser,
  })

  return queryClient.getQueryData<UserData | null>(createUserQueryKey()) ?? null
}
