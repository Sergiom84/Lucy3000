import { describe, expect, it } from 'vitest'
import {
  buildSearchTokens,
  filterRankedItems,
  filterSearchableOptions,
  type SearchableOption
} from '../../../src/renderer/utils/searchableOptions'

const createOption = (id: string, label: string, detail = ''): SearchableOption => ({
  id,
  label,
  detail,
  searchText: `${label} ${detail}`.trim(),
  labelTokens: buildSearchTokens(label),
  searchTokens: buildSearchTokens(`${label} ${detail}`.trim())
})

describe('searchableOptions', () => {
  it('matches separate name fragments in order-independent tokens', () => {
    const options = [
      createOption('1', 'Sergio Hernandez Lara', '600123123 sergio@example.com'),
      createOption('2', 'Maria Lopez', '600000000 maria@example.com')
    ]

    const results = filterSearchableOptions(options, 'ser her')

    expect(results.map((option) => option.id)).toEqual(['1'])
  })

  it('normalizes accents while searching', () => {
    const options = [
      createOption('1', 'Maria Garcia'),
      createOption('2', 'Lucia Perez')
    ]

    const results = filterSearchableOptions(options, 'mar gar')

    expect(results.map((option) => option.id)).toEqual(['1'])
  })

  it('prioritizes label prefix matches before weaker matches', () => {
    const options = [
      createOption('1', 'Sergio Hernandez'),
      createOption('2', 'Ana Torres', 'sergio@empresa.com')
    ]

    const results = filterSearchableOptions(options, 'ser')

    expect(results.map((option) => option.id)).toEqual(['1', '2'])
  })

  it('filters arbitrary items using the same token ranking', () => {
    const items = [
      { id: '1', name: 'Radiofrecuencia Facial', category: 'Faciales' },
      { id: '2', name: 'Masaje Relajante', category: 'Corporales' }
    ]

    const results = filterRankedItems(items, 'rad fac', (item) => ({
      label: item.name,
      labelTokens: buildSearchTokens(item.name),
      searchText: `${item.name} ${item.category}`
    }))

    expect(results.map((item) => item.id)).toEqual(['1'])
  })
})
