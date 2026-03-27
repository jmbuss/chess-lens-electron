<script setup lang="ts">
import GamesTable from '../components/GamesTable/GamesTable.vue'

import { useUser } from 'src/renderer/composables/user/useUser'
import { Button as UIButton } from '@/components/ui/button'
import { ipcService } from 'src/ipc/renderer'
import { usePlatforms } from 'src/renderer/composables/platforms/usePlatforms'

const { user } = useUser()
const { platforms } = usePlatforms()

const handleSyncAllGames = async () => {
  const chessComPlatform = platforms.value.find(platform => platform.platform === 'chess.com')
  if (!chessComPlatform) return
  const result = await ipcService.send('chess:sync', {
    username: chessComPlatform.platformUsername,
    monthsBack: 1,
  })
  console.log('result', result)
}

const handleSyncLastMonthGames = async () => {
  const chessComPlatform = platforms.value.find(platform => platform.platform === 'chess.com')
  if (!chessComPlatform) return
  const result = await ipcService.send('chess:sync', {
    username: chessComPlatform.platformUsername,
    monthsBack: 1,
  })
  console.log('result', result)
}
</script>

<template>
  <div class="h-full">
    <!-- <UIButton @click="handleSyncLastMonthGames">Sync Last Month Games</UIButton> -->
    <GamesTable />
  </div>
</template>
