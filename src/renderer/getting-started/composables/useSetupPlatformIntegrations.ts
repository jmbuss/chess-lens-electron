import { usePlatforms } from 'src/renderer/composables/platforms/usePlatforms'
import { ref, watchEffect } from 'vue'
import { useRouter } from 'vue-router'

export const useSetupPlatformIntegrations = () => {
  const router = useRouter()

  const form = ref({
    chesscomUsername: '',
  })

  const {
    createPlatformMutation,
    isCreatingPlatform,
    isPlatformCreated,
    isPlatformCreationError,
    platformCreationError,
  } = usePlatforms()

  const handleCreateChesscomPlatform = () => {
    createPlatformMutation({
      platform: 'chess.com',
      platformUsername: form.value.chesscomUsername,
    })
  }

  watchEffect(() => {
    if (isPlatformCreated.value) {
      router.push('/')
    }
  })

  return {
    form,
    handleCreateChesscomPlatform,
    isCreatingPlatform,
    isPlatformCreated,
    isPlatformCreationError,
    platformCreationError,
  }
}
