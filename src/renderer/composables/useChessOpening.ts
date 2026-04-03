import { getOpeningsByEco, findOpening } from '@chess-openings/eco.json'
import { getOpeningBookSingleton } from 'src/utils/chess/openingBook'
import { parseGameTree, collectMainlineFens } from 'src/utils/chess/GameTree'
import { computedAsync } from '@vueuse/core'
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
    const { root } = parseGameTree(pgnValue)
    const fens = collectMainlineFens(root)

    for (let i = fens.length - 1; i >= 0; i--) {
      const opening = findOpening(book, fens[i].fen, positionBook)
      if (opening) return opening
    }
    return null
  })

  const opening = computed(() => {
    return openingFromEco.value ?? openingFromPGN.value
  })

  return { opening }
}
