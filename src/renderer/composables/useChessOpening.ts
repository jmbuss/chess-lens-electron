import { getOpeningsByEco, lookupByMoves } from '@chess-openings/eco.json'
import { getOpeningBookSingleton } from 'src/utils/chess/openingBook'
import { computedAsync } from '@vueuse/core'
import { Chess } from 'chess.js'
import { computed, MaybeRef, toValue } from 'vue'

type UseChessOpeningOptions = {
  ecoCode?: MaybeRef<string>
  pgn?: MaybeRef<string>
}

export const useChessOpening = ({ ecoCode, pgn }: UseChessOpeningOptions) => {
  const openingFromEco = computedAsync(async () => {
    const eco = toValue(ecoCode)
    if (!eco) return null
    const openings = await getOpeningsByEco(eco)
    return openings[0]
  })

  const openingFromPGN = computedAsync(async () => {
    const pgnValue = toValue(pgn)
    if (!pgnValue) return null
    const { book, positionBook } = await getOpeningBookSingleton()
    const chess = new Chess()
    chess.loadPgn(pgnValue)
    const { opening } = lookupByMoves(chess, book, { positionBook })
    return opening
  })

  const opening = computed(() => {
    return openingFromEco.value ?? openingFromPGN.value
  })

  return { opening }
}
