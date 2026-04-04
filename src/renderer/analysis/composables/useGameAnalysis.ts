import { computed, onUnmounted, watch, type MaybeRef, toValue, watchEffect } from 'vue'
import { useMutation, useQuery } from '@tanstack/vue-query'
import { queryClient } from 'src/renderer/query/queryClient'
import { ipcService } from 'src/ipc/renderer'
import type { IpcResponse } from 'src/ipc/types'
import type {
  AnalysisNode,
  GameAnalysisData,
  GameFSMState,
} from 'src/database/analysis/types'
import { useChessGame } from 'src/renderer/composables/chessGame/useChessGame'
import { useUser } from 'src/renderer/composables/user/useUser'
import { usePlatforms } from 'src/renderer/composables/platforms/usePlatforms'

interface GameStateUpdatePayload {
  gameId: string
  gameFsmState: GameFSMState
}

interface NodeUpdatePayload {
  gameId: string
  nodeId: number
  ply: number
  node: Omit<AnalysisNode, 'children'>
  gameFsmState: GameFSMState
}

interface NodeAddedPayload {
  gameId: string
  parentFen: string
  node: Omit<AnalysisNode, 'children'>
  gameFsmState: GameFSMState
}

function applyNodeUpdate(
  root: AnalysisNode,
  nodeId: number,
  update: Omit<AnalysisNode, 'children'>,
): boolean {
  if (root.id === nodeId) {
    Object.assign(root, update)
    return true
  }
  for (const child of root.children) {
    if (applyNodeUpdate(child, nodeId, update)) return true
  }
  return false
}

function mergeNodeUpdate(
  prev: GameAnalysisData,
  payload: NodeUpdatePayload,
): GameAnalysisData {
  if (!prev.tree) return prev
  const newTree: AnalysisNode = JSON.parse(JSON.stringify(prev.tree))
  applyNodeUpdate(newTree, payload.nodeId, payload.node)
  return { ...prev, gameFsmState: payload.gameFsmState, tree: newTree }
}

function flattenTree(node: AnalysisNode): AnalysisNode[] {
  const result: AnalysisNode[] = [node]
  for (const child of node.children) {
    result.push(...flattenTree(child))
  }
  return result
}

function findNodeByFen(root: AnalysisNode, fen: string): AnalysisNode | null {
  if (root.fen === fen) return root
  for (const child of root.children) {
    const found = findNodeByFen(child, fen)
    if (found) return found
  }
  return null
}

export const useGameAnalysis = (gameId: MaybeRef<string>) => {
  const queryKey = computed(() => ['game-analysis', toValue(gameId)] as const)

  watchEffect(() => {
    console.log('gameId', toValue(gameId))
  })

  const { data: gameAnalysis, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      ipcService.send('analysis:getGameAnalysis', { gameId: toValue(gameId) }),
    staleTime: Infinity,
    enabled: computed(() => !!toValue(gameId)),
  }, queryClient)

  watchEffect(() => {
    console.log('gameAnalysis', gameAnalysis.value)
  })

  const { mutate: addVariation } = useMutation({
    mutationFn: (params: {
      parentFen: string
      fen: string
      uciMove: string
      san: string
      from: string
      to: string
      piece: string
      color: 'w' | 'b'
      captured?: string
      promotion?: string
      moveNumber: number
    }) => ipcService.send('analysis:addVariation', { gameId: toValue(gameId), ...params }),
  }, queryClient)

  /**
   * Tell the game machine which position the user has navigated to. The
   * machine transitions to STOP_AND_WAIT, drains engines, then prioritizes
   * this node in POSITION_ANALYSIS before resuming background work.
   *
   * Also updates the DB priority for the FEN so the position_analysis row
   * reflects the user's focus, enabling correct cache-probe ordering.
   */
  const navigateToPosition = (nodeId: number, fen: string): void => {
    ipcService.send('analysis:studyPosition', { gameId: toValue(gameId), nodeId })
    ipcService.send('position:prioritize', { fen })
  }

  // ==================== Auto-start ====================

  const { chessGame, isChessGameLoading } = useChessGame({ gameId })
  const { user, isUserLoading } = useUser()
  const { isPlatformsLoading } = usePlatforms()

  const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

  const isPrerequisitesReady = computed(() => {
    if (isChessGameLoading.value || isUserLoading.value) return false
    if (!chessGame.value) return false
    if (user.value?.id && isPlatformsLoading.value) return false
    return true
  })

  let hasPrioritized = false

  watch(isPrerequisitesReady, async (ready) => {
    if (!ready || hasPrioritized) return
    hasPrioritized = true
    console.log('[useGameAnalysis] Prioritizing game for analysis')
    await ipcService.send('game:prioritize', {
      gameId: toValue(gameId),
      currentFen: STARTING_FEN,
    })
    // The orchestrator calls coordinator.initialize() asynchronously after
    // receiving game:queue:updated. Invalidate now so the query re-fetches
    // the analysis state once it has been hydrated.
    queryClient.invalidateQueries({ queryKey: queryKey.value })
  }, { immediate: true })

  // ==================== IPC handlers ====================

  const onNodeUpdate = (response: IpcResponse<NodeUpdatePayload>) => {
    if (!response.success || !response.data) {
      console.error('[useGameAnalysis] node-update error:', response.error)
      return
    }
    if (response.data.gameId !== toValue(gameId)) return

    const { ply, node, gameFsmState } = response.data
    console.log(
      `[useGameAnalysis] node-update ply=${ply} fsmState=${node.fsmState} gameFsm=${gameFsmState}`,
      { evalCp: node.engineResult?.evalCp, nag: node.nag },
    )

    const cacheKey = ['game-analysis', toValue(gameId)] as const
    const prev = queryClient.getQueryData<GameAnalysisData>(cacheKey)
    if (!prev) {
      queryClient.invalidateQueries({ queryKey: cacheKey })
      return
    }
    queryClient.setQueryData(cacheKey, mergeNodeUpdate(prev, response.data!))
  }

  const onGameStateUpdate = (response: IpcResponse<GameStateUpdatePayload>) => {
    if (!response.success || !response.data) {
      console.error('[useGameAnalysis] game-state-update error:', response.error)
      return
    }
    if (response.data.gameId !== toValue(gameId)) return

    const { gameFsmState } = response.data
    console.log(`[useGameAnalysis] gameFsmState → ${gameFsmState}`)

    const cacheKey = ['game-analysis', toValue(gameId)] as const
    const prev = queryClient.getQueryData<GameAnalysisData>(cacheKey)
    if (!prev) {
      queryClient.invalidateQueries({ queryKey: cacheKey })
      return
    }
    queryClient.setQueryData(cacheKey, { ...prev, gameFsmState })
  }

  const onNodeAdded = (response: IpcResponse<NodeAddedPayload>) => {
    if (!response.success || !response.data) {
      console.error('[useGameAnalysis] node-added error:', response.error)
      return
    }
    if (response.data.gameId !== toValue(gameId)) return

    const { parentFen, node, gameFsmState } = response.data
    console.log(`[useGameAnalysis] node-added id=${node.id} parentFen=${parentFen}`)

    const cacheKey = ['game-analysis', toValue(gameId)] as const
    const prev = queryClient.getQueryData<GameAnalysisData>(cacheKey)
    if (!prev?.tree) {
      queryClient.invalidateQueries({ queryKey: cacheKey })
      return
    }
    const newTree: AnalysisNode = JSON.parse(JSON.stringify(prev.tree))
    const parent = findNodeByFen(newTree, parentFen)
    if (parent) {
      parent.children.push({ ...node, children: [] })
    }
    queryClient.setQueryData(cacheKey, { ...prev, gameFsmState, tree: newTree })
  }

  // Capture the game ID now, at setup time, so the onUnmounted callback still
  // has it after Vue Router changes the route (which clears route.params before
  // the component fully unmounts).
  const capturedGameId = toValue(gameId)

  ipcService.on('analysis:node-update', onNodeUpdate)
  ipcService.on('analysis:game-state-update', onGameStateUpdate)
  ipcService.on('analysis:node-added', onNodeAdded)
  onUnmounted(() => {
    ipcService.off('analysis:node-update', onNodeUpdate)
    ipcService.off('analysis:game-state-update', onGameStateUpdate)
    ipcService.off('analysis:node-added', onNodeAdded)

    // Stop the coordinator and drain all engines so they don't keep running
    // after the user leaves the analysis page. Use emit (fire-and-forget) so
    // we don't need to await a response during component teardown.
    if (capturedGameId) {
      ipcService.emit('analysis:stopAnalysis', { gameId: capturedGameId })
    }
  })

  // ==================== Derived state ====================

  const analysisNodes = computed((): AnalysisNode[] => {
    const tree = gameAnalysis.value?.tree
    if (!tree) return []
    return flattenTree(tree)
  })

  const analysisByFen = computed((): Map<string, AnalysisNode> => {
    const map = new Map<string, AnalysisNode>()
    for (const node of analysisNodes.value) map.set(node.fen, node)
    return map
  })

  const analysisTree = computed(() => gameAnalysis.value?.tree ?? null)
  const gameFsmState = computed(() => gameAnalysis.value?.gameFsmState ?? null)
  const isComplete = computed(() => gameFsmState.value === 'COMPLETE')

  const progress = computed(() => {
    const nodes = analysisNodes.value
    if (nodes.length === 0) return 0
    const completed = nodes.filter(n => n.fsmState === 'NAG_COMPLETE').length
    return completed / nodes.length
  })

  return {
    gameAnalysis,
    analysisTree,
    analysisNodes,
    analysisByFen,
    gameFsmState,
    isComplete,
    progress,
    isLoading,
    addVariation,
    navigateToPosition,
  }
}
