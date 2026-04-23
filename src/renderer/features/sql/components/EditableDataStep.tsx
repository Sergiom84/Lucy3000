import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { filterRankedItems } from '../../../utils/searchableOptions'
import type { EditableDataStepProps, SqlEditableRow } from '../types'
import { PAGE_SIZE } from '../viewModels'
import { SummaryCard } from './SqlFormFields'

export default function EditableDataStep<T extends SqlEditableRow>({
  stepId,
  title,
  description: _description,
  rows,
  onRowsChange,
  columns,
  searchPlaceholder,
  getLabel,
  getSearchText,
  renderEditor,
  extraSummary,
  emptyMessage,
  onSelectionCountChange,
  onBulkToggle
}: EditableDataStepProps<T>) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedRowId, setSelectedRowId] = useState<string | null>(rows[0]?.id ?? null)
  const previousSelectedCountRef = useRef<number | null>(null)

  useEffect(() => {
    setPage(1)
  }, [search])

  useEffect(() => {
    if (rows.length === 0) {
      setSelectedRowId(null)
      return
    }

    if (!selectedRowId || !rows.some((row) => row.id === selectedRowId)) {
      setSelectedRowId(rows[0].id)
    }
  }, [rows, selectedRowId])

  const filteredRows = useMemo(() => {
    if (!search.trim()) {
      return rows
    }

    return filterRankedItems(rows, search, (row) => ({
      label: getLabel(row),
      searchText: getSearchText(row)
    }))
  }, [getLabel, getSearchText, rows, search])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const visibleRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const selectedRow = rows.find((row) => row.id === selectedRowId) ?? null
  const selectedCount = rows.filter((row) => row.selected).length
  const issuesCount = rows.reduce((count, row) => count + row.issues.length, 0)
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => row.selected)

  const updateRow = (id: string, patch: Partial<T>) => {
    onRowsChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const toggleVisibleRows = () => {
    const visibleIds = new Set(visibleRows.map((row) => row.id))
    const mode = allVisibleSelected ? 'deselect' : 'select'
    onRowsChange(
      rows.map((row) => (visibleIds.has(row.id) ? { ...row, selected: !allVisibleSelected } : row))
    )
    onBulkToggle?.({ mode, affectedCount: visibleRows.length })
  }

  useEffect(() => {
    if (previousSelectedCountRef.current === null) {
      previousSelectedCountRef.current = selectedCount
      return
    }

    if (previousSelectedCountRef.current !== selectedCount) {
      onSelectionCountChange?.({ selectedCount, totalRows: rows.length })
      previousSelectedCountRef.current = selectedCount
    }
  }, [onSelectionCountChange, rows.length, selectedCount, stepId])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h2>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <SummaryCard label="Total" value={String(rows.length)} />
        <SummaryCard label="Seleccionados" value={String(selectedCount)} tone="success" />
        <SummaryCard
          label="Incidencias"
          value={String(issuesCount)}
          tone={issuesCount > 0 ? 'warning' : 'default'}
        />
        {extraSummary?.map((item) => (
          <SummaryCard key={item.label} label={item.label} value={item.value} tone={item.tone} />
        ))}
      </div>

      <div className="card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              className="input pl-10"
            />
          </div>

          <button onClick={toggleVisibleRows} className="btn btn-secondary">
            {allVisibleSelected ? 'Deseleccionar visibles' : 'Seleccionar visibles'}
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(24rem,0.85fr)]">
        <div className="card min-w-0">
          {filteredRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="w-14">Usar</th>
                      {columns.map((column) => (
                        <th key={column.header} className={column.className}>
                          {column.header}
                        </th>
                      ))}
                      <th className="w-24 text-right">Avisos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr
                        key={row.id}
                        className={`cursor-pointer ${
                          row.id === selectedRowId ? 'bg-primary-50/70 dark:bg-primary-900/10' : ''
                        }`}
                        onClick={() => setSelectedRowId(row.id)}
                      >
                        <td onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={(event) => updateRow(row.id, { selected: event.target.checked } as Partial<T>)}
                            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                        </td>
                        {columns.map((column) => (
                          <td key={column.header} className={column.className}>
                            {column.render(row)}
                          </td>
                        ))}
                        <td className="text-right">
                          {row.issues.length > 0 ? (
                            <span className="badge badge-warning">{row.issues.length}</span>
                          ) : (
                            <span className="text-sm text-gray-400">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
                <p>
                  Mostrando {(currentPage - 1) * PAGE_SIZE + 1} -{' '}
                  {Math.min(currentPage * PAGE_SIZE, filteredRows.length)} de {filteredRows.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    disabled={currentPage === 1}
                    className="btn btn-secondary btn-sm disabled:opacity-50"
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Anterior
                  </button>
                  <span>
                    Página {currentPage} de {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                    disabled={currentPage === totalPages}
                    className="btn btn-secondary btn-sm disabled:opacity-50"
                  >
                    Siguiente
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="card h-fit">
          {selectedRow ? (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{getLabel(selectedRow)}</h3>
                {selectedRow.issues.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {selectedRow.issues.map((issue) => (
                      <div
                        key={issue}
                        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200"
                      >
                        {issue}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {renderEditor(selectedRow, (patch) => updateRow(selectedRow.id, patch))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Selecciona un registro para revisarlo o editarlo.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
