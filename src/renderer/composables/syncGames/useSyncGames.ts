import { ipcService } from 'src/ipc/renderer'
import { onMounted, onUnmounted, ref } from 'vue'
import { usePlatforms } from '../platforms/usePlatforms'
import { SyncProgress } from 'src/services/sync/types'
import { queryClient } from 'src/renderer/query/queryClient'

export const useSyncGames = () => {
  const status = ref<SyncProgress | null>(null)
  const error = ref<string | null>(null)
  const isLoading = ref(false)
  const isError = ref(false)
  const isSuccess = ref(false)

  const { platforms } = usePlatforms()

  const startSync = async () => {
    isLoading.value = true
    error.value = null
    isSuccess.value = false
    status.value = null
    try {
      for (const { platform, platformUsername: username } of platforms.value) {
        console.log('starting sync for', username, platform)
        const response = await ipcService.send('sync:start', { username, platform })
        status.value = response
      }
    } catch (error) {
      // error.value = error instanceof Error ? error.message : 'Unknown error'
    }
    isLoading.value = false
  }

  const pauseSync = async () => {
    for (const { platform, platformUsername: username } of platforms.value) {
      await ipcService.send('sync:pause', { username, platform })
    }
  }

  const resumeSync = async () => {
    for (const { platform, platformUsername: username } of platforms.value) {
      await ipcService.send('sync:resume', { username, platform })
    }
  }

  const handleProgress = (progress: SyncProgress) => {
    status.value = progress
    isLoading.value = progress.status === 'in_progress'
    error.value = progress.error || null
    queryClient.invalidateQueries({ queryKey: ['chess-games'] })
  }

  onMounted(() => {
    startSync()

    ipcService.onPush('sync:progress', handleProgress)
  })

  onUnmounted(() => {
    ipcService.offPush('sync:progress', handleProgress)
  })

  return {
    status,
    error,
    isLoading,
    isError,
    isSuccess,
    startSync,
    pauseSync,
    resumeSync,
  }
}
