import { useMutation, useQuery } from '@tanstack/vue-query'
import { ipcService } from 'src/ipc/renderer'
import { queryClient } from 'src/renderer/query/queryClient'

const FAVORITES_QUERY_KEY = ['favorites'] as const

export const useFavorites = () => {
  const {
    data: favoriteIds,
    isLoading: isFavoritesLoading,
  } = useQuery({
    queryKey: FAVORITES_QUERY_KEY,
    queryFn: () => ipcService.send('favorites:getAll', undefined),
  }, queryClient)

  const { mutate: toggleFavorite } = useMutation({
    mutationFn: (gameId: string) => ipcService.send('favorites:toggle', { gameId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FAVORITES_QUERY_KEY })
    },
  }, queryClient)

  return {
    favoriteIds,
    isFavoritesLoading,
    toggleFavorite,
  }
}
