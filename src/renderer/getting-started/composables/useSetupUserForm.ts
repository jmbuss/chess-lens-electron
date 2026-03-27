import { ipcService } from 'src/ipc/renderer'
import { ref, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { useUser } from 'src/renderer/composables/user/useUser'

export const useSetupUserForm = () => {
  const router = useRouter()

  const form = ref({
    firstName: '',
    lastName: '',
    email: '',
    chesscomUsername: '',
  })

  const { createUser, isCreatingUser, isUserCreated, isUserCreationError, userCreationError } =
    useUser()

  const handleCreateUser = () => {
    createUser({
      firstName: form.value.firstName,
      lastName: form.value.lastName,
      email: form.value.email,
    })
  }

  watchEffect(() => {
    if (isUserCreated.value) {
      router.push('/getting-started/setup-platform-integrations')
    }
  })

  return {
    form,
    handleCreateUser,
    isCreatingUser,
    isUserCreated,
    isUserCreationError,
    userCreationError,
  }
}
