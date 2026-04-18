export type SearchableOption = {
  id: string
  label: string
  detail?: string
  searchText: string
  labelTokens?: string[]
  searchTokens?: string[]
}

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

export const normalizeSearchText = normalizeText

export const buildSearchTokens = (value: unknown) => {
  const normalized = normalizeText(value)
  return normalized.split(/[^a-z0-9@.+]+/g).filter(Boolean)
}

type RankedSearchItem = {
  label: string
  searchText?: string
  labelTokens?: string[]
  searchTokens?: string[]
}

const getBestTokenRank = (queryToken: string, tokens: string[]) => {
  let bestRank = Number.POSITIVE_INFINITY

  for (const token of tokens) {
    if (token === queryToken) return 0
    if (token.startsWith(queryToken)) {
      bestRank = Math.min(bestRank, 1)
      continue
    }
    if (token.includes(queryToken)) {
      bestRank = Math.min(bestRank, 2)
    }
  }

  return bestRank
}

const getRankedItemScore = (item: RankedSearchItem, queryTokens: string[]) => {
  const labelTokens = item.labelTokens ?? buildSearchTokens(item.label)
  const searchTokens = item.searchTokens ?? buildSearchTokens(item.searchText)

  let score = 0

  for (const queryToken of queryTokens) {
    const labelRank = getBestTokenRank(queryToken, labelTokens)
    if (Number.isFinite(labelRank)) {
      score += labelRank
      continue
    }

    const searchRank = getBestTokenRank(queryToken, searchTokens)
    if (Number.isFinite(searchRank)) {
      score += searchRank + 3
      continue
    }

    return Number.POSITIVE_INFINITY
  }

  return score
}

export const filterRankedItems = <T>(
  items: T[],
  query: string,
  getRankedItem: (item: T) => RankedSearchItem
) => {
  const queryTokens = buildSearchTokens(query)
  if (queryTokens.length === 0) {
    return items
  }

  return items
    .map((item) => {
      const rankedItem = getRankedItem(item)

      return {
        item,
        label: rankedItem.label,
        score: getRankedItemScore(rankedItem, queryTokens)
      }
    })
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score
      }

      return left.label.localeCompare(right.label, 'es', { sensitivity: 'base' })
    })
    .map((entry) => entry.item)
}

export const filterSearchableOptions = (options: SearchableOption[], query: string) => {
  return filterRankedItems(options, query, (option) => option)
}
