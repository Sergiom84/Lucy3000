import EditableDataStep from '../components/EditableDataStep'
import { CheckboxField, NumberField, SelectField, TextAreaField, TextField } from '../components/SqlFormFields'
import { formatMaybeCurrency, formatMaybeNumber, normalizeOptionalText } from '../helpers'
import type {
  SqlAnalysisResult,
  SqlEditableStepKey,
  SqlTrackEventPayload,
  SqlUserOption,
  WizardStepId
} from '../types'

type SqlEditableStepViewsProps = {
  currentStep: Exclude<WizardStepId, 'file' | 'summary'>
  analysis: SqlAnalysisResult
  updateAnalysisRows: <K extends SqlEditableStepKey>(key: K, rows: SqlAnalysisResult[K]) => void
  trackEvent: (payload: SqlTrackEventPayload) => Promise<void>
  userOptions: SqlUserOption[]
}

export default function SqlEditableStepViews({
  currentStep,
  analysis,
  updateAnalysisRows,
  trackEvent,
  userOptions
}: SqlEditableStepViewsProps) {
  if (currentStep === 'clients') {
    return (
      <EditableDataStep
        stepId="clients"
        title="2. Clientes"
        description="Revisa los clientes detectados, decide cuáles conservar y corrige los datos que Lucy3000 deberá guardar."
        rows={analysis.clients}
        onRowsChange={(rows) => updateAnalysisRows('clients', rows)}
        searchPlaceholder="Buscar por nombre, código legacy, DNI, email, teléfono o notas..."
        getLabel={(row) => row.fullName || row.legacyClientNumber}
        getSearchText={(row) =>
          [
            row.legacyClientNumber,
            row.fullName,
            row.dni,
            row.email,
            row.phone,
            row.mobilePhone,
            row.landlinePhone,
            row.city,
            row.clientBrand,
            row.notes
          ]
            .filter(Boolean)
            .join(' ')
        }
        columns={[
          {
            header: 'Cliente',
            render: (row) => (
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{row.fullName || '-'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">#{row.legacyClientNumber}</p>
              </div>
            )
          },
          {
            header: 'Contacto',
            render: (row) => (
              <div>
                <p>{row.phone || row.mobilePhone || row.landlinePhone || '-'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{row.email || 'Sin email'}</p>
              </div>
            )
          },
          {
            header: 'DNI',
            render: (row) => row.dni || '-'
          },
          {
            header: 'Ciudad',
            render: (row) => row.city || '-'
          },
          {
            header: 'Activa',
            render: (row) => (
              <span className={`badge ${row.isActive ? 'badge-success' : 'badge-warning'}`}>
                {row.isActive ? 'Sí' : 'No'}
              </span>
            )
          }
        ]}
        extraSummary={[
          {
            label: 'Con email',
            value: String(analysis.clients.filter((row) => row.email).length)
          },
          {
            label: 'Inactivos',
            value: String(analysis.clients.filter((row) => !row.isActive).length),
            tone: analysis.clients.some((row) => !row.isActive) ? 'warning' : 'default'
          }
        ]}
        emptyMessage="No hay clientes que coincidan con la búsqueda actual."
        onSelectionCountChange={({ selectedCount, totalRows }) => {
          void trackEvent({
            type: 'selection_changed',
            step: 'clients',
            message: `Clientes seleccionados: ${selectedCount}/${totalRows}`,
            payload: { selectedCount, totalRows }
          })
        }}
        onBulkToggle={({ mode, affectedCount }) => {
          void trackEvent({
            type: 'bulk_toggle',
            step: 'clients',
            message: `${mode === 'select' ? 'Seleccionados' : 'Deseleccionados'} ${affectedCount} clientes visibles`,
            payload: { mode, affectedCount }
          })
        }}
        renderEditor={(row, updateRow) => (
          <div className="space-y-4">
            <CheckboxField
              label="Importar este cliente"
              checked={row.selected}
              onChange={(selected) => updateRow({ selected })}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="Código legacy"
                value={row.legacyClientNumber}
                onChange={(value) => updateRow({ legacyClientNumber: value })}
              />
              <TextField label="DNI" value={row.dni} onChange={(value) => updateRow({ dni: normalizeOptionalText(value) })} />
              <TextField label="Nombre completo" value={row.fullName} onChange={(value) => updateRow({ fullName: value })} />
              <TextField label="Nombre" value={row.firstName} onChange={(value) => updateRow({ firstName: value })} />
              <TextField label="Apellidos" value={row.lastName} onChange={(value) => updateRow({ lastName: value })} />
              <TextField label="Email" type="email" value={row.email} onChange={(value) => updateRow({ email: normalizeOptionalText(value) })} />
              <TextField label="Teléfono" value={row.phone} onChange={(value) => updateRow({ phone: normalizeOptionalText(value) })} />
              <TextField label="Móvil" value={row.mobilePhone} onChange={(value) => updateRow({ mobilePhone: normalizeOptionalText(value) })} />
              <TextField label="Fijo" value={row.landlinePhone} onChange={(value) => updateRow({ landlinePhone: normalizeOptionalText(value) })} />
              <TextField
                label="Fecha nacimiento"
                type="date"
                value={row.birthDate}
                onChange={(value) => updateRow({ birthDate: normalizeOptionalText(value) })}
              />
              <TextField
                label="Fecha alta"
                type="date"
                value={row.registrationDate}
                onChange={(value) => updateRow({ registrationDate: normalizeOptionalText(value) })}
              />
              <TextField label="Sexo" value={row.gender} onChange={(value) => updateRow({ gender: normalizeOptionalText(value) })} />
              <TextField label="Dirección" value={row.address} onChange={(value) => updateRow({ address: normalizeOptionalText(value) })} />
              <TextField label="Ciudad" value={row.city} onChange={(value) => updateRow({ city: normalizeOptionalText(value) })} />
              <TextField label="Provincia" value={row.province} onChange={(value) => updateRow({ province: normalizeOptionalText(value) })} />
              <TextField
                label="Código postal"
                value={row.postalCode}
                onChange={(value) => updateRow({ postalCode: normalizeOptionalText(value) })}
              />
              <TextField
                label="Profesional legacy"
                value={row.legacyProfessionalCode}
                onChange={(value) => updateRow({ legacyProfessionalCode: normalizeOptionalText(value) })}
              />
              <TextField
                label="Marca cliente"
                value={row.clientBrand}
                onChange={(value) => updateRow({ clientBrand: normalizeOptionalText(value) })}
              />
              <TextField
                label="Tarifa aplicada"
                value={row.appliedTariff}
                onChange={(value) => updateRow({ appliedTariff: normalizeOptionalText(value) })}
              />
              <TextField
                label="Referencia foto"
                value={row.photoRef}
                onChange={(value) => updateRow({ photoRef: normalizeOptionalText(value) })}
              />
            </div>

            <TextAreaField label="Notas" value={row.notes} onChange={(value) => updateRow({ notes: normalizeOptionalText(value) })} />
            <CheckboxField label="Cliente activo" checked={row.isActive} onChange={(isActive) => updateRow({ isActive })} />
          </div>
        )}
      />
    )
  }

  if (currentStep === 'services') {
    return (
      <EditableDataStep
        stepId="services"
        title="3. Tratamientos"
        description="Normaliza el catálogo de tratamientos antes de usarlo para bonos y citas."
        rows={analysis.services}
        onRowsChange={(rows) => updateAnalysisRows('services', rows)}
        searchPlaceholder="Buscar por código, nombre, descripción o categoría..."
        getLabel={(row) => `${row.code} · ${row.name}`}
        getSearchText={(row) =>
          [row.code, row.name, row.description, row.category, row.screenCategory].filter(Boolean).join(' ')
        }
        columns={[
          {
            header: 'Código',
            render: (row) => row.code
          },
          {
            header: 'Tratamiento',
            render: (row) => (
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{row.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{row.category || 'Sin categoría'}</p>
              </div>
            )
          },
          {
            header: 'Duración',
            render: (row) => (row.durationMinutes ? `${row.durationMinutes} min` : '-')
          },
          {
            header: 'PVP',
            render: (row) => formatMaybeCurrency(row.price)
          },
          {
            header: 'Pack',
            render: (row) => (
              <span className={`badge ${row.isPack ? 'badge-primary' : 'badge-info'}`}>{row.isPack ? 'Sí' : 'No'}</span>
            )
          }
        ]}
        extraSummary={[
          {
            label: 'Con duración',
            value: String(analysis.services.filter((row) => row.durationMinutes).length)
          },
          {
            label: 'Packs',
            value: String(analysis.services.filter((row) => row.isPack).length)
          }
        ]}
        emptyMessage="No hay tratamientos que coincidan con la búsqueda actual."
        onSelectionCountChange={({ selectedCount, totalRows }) => {
          void trackEvent({
            type: 'selection_changed',
            step: 'services',
            message: `Tratamientos seleccionados: ${selectedCount}/${totalRows}`,
            payload: { selectedCount, totalRows }
          })
        }}
        onBulkToggle={({ mode, affectedCount }) => {
          void trackEvent({
            type: 'bulk_toggle',
            step: 'services',
            message: `${mode === 'select' ? 'Seleccionados' : 'Deseleccionados'} ${affectedCount} tratamientos visibles`,
            payload: { mode, affectedCount }
          })
        }}
        renderEditor={(row, updateRow) => (
          <div className="space-y-4">
            <CheckboxField
              label="Importar este tratamiento"
              checked={row.selected}
              onChange={(selected) => updateRow({ selected })}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Código" value={row.code} onChange={(value) => updateRow({ code: value })} />
              <TextField label="Nombre" value={row.name} onChange={(value) => updateRow({ name: value })} />
              <TextField
                label="Descripción"
                value={row.description}
                onChange={(value) => updateRow({ description: normalizeOptionalText(value) })}
              />
              <TextField
                label="Categoría"
                value={row.category}
                onChange={(value) => updateRow({ category: normalizeOptionalText(value) })}
              />
              <TextField
                label="Categoría pantalla"
                value={row.screenCategory}
                onChange={(value) => updateRow({ screenCategory: normalizeOptionalText(value) })}
              />
              <NumberField label="Precio" value={row.price} onChange={(price) => updateRow({ price })} step="0.01" />
              <NumberField
                label="Duración (min)"
                value={row.durationMinutes}
                onChange={(durationMinutes) => updateRow({ durationMinutes })}
              />
              <NumberField label="IVA" value={row.taxRate} onChange={(taxRate) => updateRow({ taxRate })} step="0.01" />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <CheckboxField label="Es pack" checked={row.isPack} onChange={(isPack) => updateRow({ isPack })} />
              <CheckboxField
                label="Requiere producto"
                checked={row.requiresProduct}
                onChange={(requiresProduct) => updateRow({ requiresProduct })}
              />
              <CheckboxField label="Activo" checked={row.isActive} onChange={(isActive) => updateRow({ isActive })} />
            </div>
          </div>
        )}
      />
    )
  }

  if (currentStep === 'products') {
    return (
      <EditableDataStep
        stepId="products"
        title="4. Productos"
        description="Ajusta el catálogo de productos, stock y referencias antes de incorporarlo."
        rows={analysis.products}
        onRowsChange={(rows) => updateAnalysisRows('products', rows)}
        searchPlaceholder="Buscar por SKU, nombre, marca, categoría, proveedor o código..."
        getLabel={(row) => `${row.sku} · ${row.name}`}
        getSearchText={(row) =>
          [
            row.sku,
            row.name,
            row.brand,
            row.category,
            row.supplier,
            row.barcode,
            row.description,
            row.legacyProductNumber
          ]
            .filter(Boolean)
            .join(' ')
        }
        columns={[
          {
            header: 'SKU',
            render: (row) => row.sku
          },
          {
            header: 'Producto',
            render: (row) => (
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{row.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{row.brand || 'Sin marca'}</p>
              </div>
            )
          },
          {
            header: 'Categoría',
            render: (row) => row.category || '-'
          },
          {
            header: 'Stock',
            render: (row) => formatMaybeNumber(row.stock)
          },
          {
            header: 'PVP',
            render: (row) => formatMaybeCurrency(row.price)
          }
        ]}
        extraSummary={[
          {
            label: 'Con stock',
            value: String(analysis.products.filter((row) => (row.stock ?? 0) > 0).length)
          },
          {
            label: 'Con proveedor',
            value: String(analysis.products.filter((row) => row.supplier).length)
          }
        ]}
        emptyMessage="No hay productos que coincidan con la búsqueda actual."
        onSelectionCountChange={({ selectedCount, totalRows }) => {
          void trackEvent({
            type: 'selection_changed',
            step: 'products',
            message: `Productos seleccionados: ${selectedCount}/${totalRows}`,
            payload: { selectedCount, totalRows }
          })
        }}
        onBulkToggle={({ mode, affectedCount }) => {
          void trackEvent({
            type: 'bulk_toggle',
            step: 'products',
            message: `${mode === 'select' ? 'Seleccionados' : 'Deseleccionados'} ${affectedCount} productos visibles`,
            payload: { mode, affectedCount }
          })
        }}
        renderEditor={(row, updateRow) => (
          <div className="space-y-4">
            <CheckboxField
              label="Importar este producto"
              checked={row.selected}
              onChange={(selected) => updateRow({ selected })}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="Código legacy"
                value={row.legacyProductNumber}
                onChange={(value) => updateRow({ legacyProductNumber: value })}
              />
              <TextField label="SKU" value={row.sku} onChange={(value) => updateRow({ sku: value })} />
              <TextField
                label="Código de barras"
                value={row.barcode}
                onChange={(value) => updateRow({ barcode: normalizeOptionalText(value) })}
              />
              <TextField label="Nombre" value={row.name} onChange={(value) => updateRow({ name: value })} />
              <TextField
                label="Categoría"
                value={row.category}
                onChange={(value) => updateRow({ category: normalizeOptionalText(value) })}
              />
              <TextField
                label="Marca"
                value={row.brand}
                onChange={(value) => updateRow({ brand: normalizeOptionalText(value) })}
              />
              <TextField
                label="Proveedor"
                value={row.supplier}
                onChange={(value) => updateRow({ supplier: normalizeOptionalText(value) })}
              />
              <NumberField label="Coste" value={row.cost} onChange={(cost) => updateRow({ cost })} step="0.01" />
              <NumberField label="Precio venta" value={row.price} onChange={(price) => updateRow({ price })} step="0.01" />
              <NumberField label="Stock" value={row.stock} onChange={(stock) => updateRow({ stock })} />
              <NumberField label="Stock mínimo" value={row.minStock} onChange={(minStock) => updateRow({ minStock })} />
              <NumberField label="Stock máximo" value={row.maxStock} onChange={(maxStock) => updateRow({ maxStock })} />
            </div>

            <TextAreaField
              label="Descripción"
              value={row.description}
              onChange={(value) => updateRow({ description: normalizeOptionalText(value) })}
            />
            <CheckboxField label="Producto activo" checked={row.isActive} onChange={(isActive) => updateRow({ isActive })} />
          </div>
        )}
      />
    )
  }

  if (currentStep === 'bonoTemplates') {
    return (
      <EditableDataStep
        stepId="bonoTemplates"
        title="5. Bonos"
        description="Revisa las plantillas de bonos derivadas del catálogo legacy."
        rows={analysis.bonoTemplates}
        onRowsChange={(rows) => updateAnalysisRows('bonoTemplates', rows)}
        searchPlaceholder="Buscar por tratamiento, código o categoría..."
        getLabel={(row) => `${row.serviceName} · ${row.totalSessions} sesiones`}
        getSearchText={(row) => [row.serviceCode, row.serviceName, row.category].filter(Boolean).join(' ')}
        columns={[
          {
            header: 'Tratamiento',
            render: (row) => (
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{row.serviceName}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{row.serviceCode}</p>
              </div>
            )
          },
          {
            header: 'Slot',
            render: (row) => String(row.slot)
          },
          {
            header: 'Sesiones',
            render: (row) => String(row.totalSessions)
          },
          {
            header: 'Precio',
            render: (row) => formatMaybeCurrency(row.price)
          }
        ]}
        extraSummary={[
          {
            label: 'Bonos activos',
            value: String(analysis.bonoTemplates.filter((row) => row.isActive).length)
          }
        ]}
        emptyMessage="No hay bonos que coincidan con la búsqueda actual."
        onSelectionCountChange={({ selectedCount, totalRows }) => {
          void trackEvent({
            type: 'selection_changed',
            step: 'bonoTemplates',
            message: `Bonos seleccionados: ${selectedCount}/${totalRows}`,
            payload: { selectedCount, totalRows }
          })
        }}
        onBulkToggle={({ mode, affectedCount }) => {
          void trackEvent({
            type: 'bulk_toggle',
            step: 'bonoTemplates',
            message: `${mode === 'select' ? 'Seleccionados' : 'Deseleccionados'} ${affectedCount} bonos visibles`,
            payload: { mode, affectedCount }
          })
        }}
        renderEditor={(row, updateRow) => (
          <div className="space-y-4">
            <CheckboxField label="Importar este bono" checked={row.selected} onChange={(selected) => updateRow({ selected })} />

            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Código tratamiento" value={row.serviceCode} onChange={(value) => updateRow({ serviceCode: value })} />
              <TextField label="Nombre tratamiento" value={row.serviceName} onChange={(value) => updateRow({ serviceName: value })} />
              <TextField
                label="Categoría"
                value={row.category}
                onChange={(value) => updateRow({ category: normalizeOptionalText(value) })}
              />
              <NumberField label="Slot legacy" value={row.slot} onChange={(slot) => updateRow({ slot: slot ?? row.slot })} />
              <NumberField
                label="Sesiones"
                value={row.totalSessions}
                onChange={(totalSessions) => updateRow({ totalSessions: totalSessions ?? row.totalSessions })}
              />
              <NumberField label="Precio" value={row.price} onChange={(price) => updateRow({ price })} step="0.01" />
            </div>

            <CheckboxField label="Bono activo" checked={row.isActive} onChange={(isActive) => updateRow({ isActive })} />
          </div>
        )}
      />
    )
  }

  if (currentStep === 'clientBonos') {
    return (
      <EditableDataStep
        stepId="clientBonos"
        title="6. Bonos del cliente"
        description="Cada registro representa un bono o pack que ya tenía un cliente en el sistema anterior."
        rows={analysis.clientBonos}
        onRowsChange={(rows) => updateAnalysisRows('clientBonos', rows)}
        searchPlaceholder="Buscar por cliente, descripción, número legacy o código de tratamiento..."
        getLabel={(row) => `${row.clientNumber} · ${row.description}`}
        getSearchText={(row) => [row.clientNumber, row.description, row.serviceCode, row.legacyNumber].filter(Boolean).join(' ')}
        columns={[
          {
            header: 'Cliente',
            render: (row) => row.clientNumber
          },
          {
            header: 'Bono',
            render: (row) => (
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{row.description}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{row.serviceCode || 'Sin código'}</p>
              </div>
            )
          },
          {
            header: 'Restantes',
            render: (row) => `${row.remainingSessions}/${row.totalSessions}`
          },
          {
            header: 'Valor',
            render: (row) => formatMaybeCurrency(row.legacyValue)
          }
        ]}
        extraSummary={[
          {
            label: 'Con saldo',
            value: String(analysis.clientBonos.filter((row) => row.remainingSessions > 0).length)
          }
        ]}
        emptyMessage="No hay bonos de cliente que coincidan con la búsqueda actual."
        onSelectionCountChange={({ selectedCount, totalRows }) => {
          void trackEvent({
            type: 'selection_changed',
            step: 'clientBonos',
            message: `Bonos de cliente seleccionados: ${selectedCount}/${totalRows}`,
            payload: { selectedCount, totalRows }
          })
        }}
        onBulkToggle={({ mode, affectedCount }) => {
          void trackEvent({
            type: 'bulk_toggle',
            step: 'clientBonos',
            message: `${mode === 'select' ? 'Seleccionados' : 'Deseleccionados'} ${affectedCount} bonos de cliente visibles`,
            payload: { mode, affectedCount }
          })
        }}
        renderEditor={(row, updateRow) => (
          <div className="space-y-4">
            <CheckboxField
              label="Importar este bono de cliente"
              checked={row.selected}
              onChange={(selected) => updateRow({ selected })}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Número legacy" value={row.legacyNumber} onChange={(value) => updateRow({ legacyNumber: value })} />
              <TextField label="Cliente" value={row.clientNumber} onChange={(value) => updateRow({ clientNumber: value })} />
              <TextField
                label="Código tratamiento"
                value={row.serviceCode}
                onChange={(value) => updateRow({ serviceCode: normalizeOptionalText(value) })}
              />
              <TextField label="Descripción" value={row.description} onChange={(value) => updateRow({ description: value })} />
              <NumberField
                label="Sesiones totales"
                value={row.totalSessions}
                onChange={(totalSessions) => updateRow({ totalSessions: totalSessions ?? row.totalSessions })}
              />
              <NumberField
                label="Consumidas"
                value={row.consumedSessions}
                onChange={(consumedSessions) => updateRow({ consumedSessions: consumedSessions ?? row.consumedSessions })}
              />
              <NumberField
                label="Restantes"
                value={row.remainingSessions}
                onChange={(remainingSessions) => updateRow({ remainingSessions: remainingSessions ?? row.remainingSessions })}
              />
              <NumberField
                label="Valor legacy"
                value={row.legacyValue}
                onChange={(legacyValue) => updateRow({ legacyValue })}
                step="0.01"
              />
            </div>
          </div>
        )}
      />
    )
  }

  if (currentStep === 'accountBalances') {
    return (
      <EditableDataStep
        stepId="accountBalances"
        title="7. Abonos del cliente"
        description="Estos movimientos vienen del bloque legacy de abonos/regalos. Revísalos con cuidado antes de darlos por válidos."
        rows={analysis.accountBalances}
        onRowsChange={(rows) => updateAnalysisRows('accountBalances', rows)}
        searchPlaceholder="Buscar por cliente, descripción, tipo o número legacy..."
        getLabel={(row) => `${row.clientNumber} · ${row.description}`}
        getSearchText={(row) => [row.clientNumber, row.description, row.kind, row.legacyNumber].filter(Boolean).join(' ')}
        columns={[
          {
            header: 'Cliente',
            render: (row) => row.clientNumber
          },
          {
            header: 'Descripción',
            render: (row) => row.description
          },
          {
            header: 'Tipo',
            render: (row) => row.kind
          },
          {
            header: 'Importe',
            render: (row) => formatMaybeCurrency(row.amount)
          }
        ]}
        extraSummary={[
          {
            label: 'Con importe',
            value: String(analysis.accountBalances.filter((row) => row.amount !== null).length)
          }
        ]}
        emptyMessage="No hay abonos de cliente que coincidan con la búsqueda actual."
        onSelectionCountChange={({ selectedCount, totalRows }) => {
          void trackEvent({
            type: 'selection_changed',
            step: 'accountBalances',
            message: `Abonos seleccionados: ${selectedCount}/${totalRows}`,
            payload: { selectedCount, totalRows }
          })
        }}
        onBulkToggle={({ mode, affectedCount }) => {
          void trackEvent({
            type: 'bulk_toggle',
            step: 'accountBalances',
            message: `${mode === 'select' ? 'Seleccionados' : 'Deseleccionados'} ${affectedCount} abonos visibles`,
            payload: { mode, affectedCount }
          })
        }}
        renderEditor={(row, updateRow) => (
          <div className="space-y-4">
            <CheckboxField label="Importar este abono" checked={row.selected} onChange={(selected) => updateRow({ selected })} />

            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Número legacy" value={row.legacyNumber} onChange={(value) => updateRow({ legacyNumber: value })} />
              <TextField label="Cliente" value={row.clientNumber} onChange={(value) => updateRow({ clientNumber: value })} />
              <TextField label="Tipo" value={row.kind} onChange={(value) => updateRow({ kind: value })} />
              <NumberField label="Importe" value={row.amount} onChange={(amount) => updateRow({ amount })} step="0.01" />
              <NumberField label="Nominal raw" value={row.rawNominal} onChange={(rawNominal) => updateRow({ rawNominal })} step="0.01" />
              <NumberField label="Consumido raw" value={row.rawConsumed} onChange={(rawConsumed) => updateRow({ rawConsumed })} step="0.01" />
            </div>

            <TextAreaField label="Descripción" value={row.description} onChange={(value) => updateRow({ description: value })} />
          </div>
        )}
      />
    )
  }

  return (
    <EditableDataStep
      stepId="appointments"
      title="8. Citas"
      description="Aquí revisas la agenda histórica y asignas cada cita a un usuario real de Lucy3000 cuando proceda."
      rows={analysis.appointments}
      onRowsChange={(rows) => updateAnalysisRows('appointments', rows)}
      searchPlaceholder="Buscar por cliente, tratamiento, profesional, cabina o notas..."
      getLabel={(row) => `${row.date} · ${row.clientName}`}
      getSearchText={(row) =>
        [
          row.clientName,
          row.legacyClientNumber,
          row.serviceCode,
          row.serviceName,
          row.legacyProfessionalCode,
          row.legacyProfessionalName,
          row.secondaryProfessionalCode,
          row.cabin,
          row.notes
        ]
          .filter(Boolean)
          .join(' ')
      }
      columns={[
        {
          header: 'Fecha',
          render: (row) => (
            <div>
              <p className="font-medium text-gray-900 dark:text-white">{row.date}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {row.startTime} {row.endTime ? `- ${row.endTime}` : ''}
              </p>
            </div>
          )
        },
        {
          header: 'Cliente',
          render: (row) => (
            <div>
              <p className="font-medium text-gray-900 dark:text-white">{row.clientName}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{row.legacyClientNumber || 'Sin cliente'}</p>
            </div>
          )
        },
        {
          header: 'Tratamiento',
          render: (row) => row.serviceName || '-'
        },
        {
          header: 'Profesional',
          render: (row) => (
            <div>
              <p>{row.legacyProfessionalName || row.legacyProfessionalCode || '-'}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {row.targetUserId
                  ? userOptions.find((option) => option.value === row.targetUserId)?.label || 'Asignado'
                  : 'Sin asignar'}
              </p>
            </div>
          )
        },
        {
          header: 'Estado',
          render: (row) => <span className="badge badge-success">{row.status || 'Cita'}</span>
        }
      ]}
      extraSummary={[
        {
          label: 'Bloqueos aparte',
          value: String(analysis.agendaBlocks.filter((row) => row.selected).length),
          tone: analysis.agendaBlocks.some((row) => row.selected) ? 'warning' : 'default'
        },
        {
          label: 'Sin usuario Lucy',
          value: String(
            analysis.appointments.filter((row) => row.selected && row.legacyProfessionalCode && !row.targetUserId).length
          ),
          tone: analysis.appointments.some((row) => row.selected && row.legacyProfessionalCode && !row.targetUserId)
            ? 'warning'
            : 'success'
        }
      ]}
      emptyMessage="No hay citas que coincidan con la búsqueda actual."
      onSelectionCountChange={({ selectedCount, totalRows }) => {
        void trackEvent({
          type: 'selection_changed',
          step: 'appointments',
          message: `Citas seleccionadas: ${selectedCount}/${totalRows}`,
          payload: { selectedCount, totalRows }
        })
      }}
      onBulkToggle={({ mode, affectedCount }) => {
        void trackEvent({
          type: 'bulk_toggle',
          step: 'appointments',
          message: `${mode === 'select' ? 'Seleccionadas' : 'Deseleccionadas'} ${affectedCount} citas visibles`,
          payload: { mode, affectedCount }
        })
      }}
      renderEditor={(row, updateRow) => (
        <div className="space-y-4">
          <CheckboxField label="Importar esta cita" checked={row.selected} onChange={(selected) => updateRow({ selected })} />

          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Cliente legacy"
              value={row.legacyClientNumber}
              onChange={(value) => updateRow({ legacyClientNumber: normalizeOptionalText(value) })}
            />
            <TextField label="Nombre cliente" value={row.clientName} onChange={(value) => updateRow({ clientName: value })} />
            <TextField label="Teléfono" value={row.phone} onChange={(value) => updateRow({ phone: normalizeOptionalText(value) })} />
            <TextField
              label="Código tratamiento"
              value={row.serviceCode}
              onChange={(value) => updateRow({ serviceCode: normalizeOptionalText(value) })}
            />
            <TextField
              label="Tratamiento"
              value={row.serviceName}
              onChange={(value) => updateRow({ serviceName: normalizeOptionalText(value) })}
            />
            <TextField label="Fecha" type="date" value={row.date} onChange={(value) => updateRow({ date: value })} />
            <TextField label="Hora inicio" type="time" value={row.startTime} onChange={(value) => updateRow({ startTime: value })} />
            <TextField
              label="Hora fin"
              type="time"
              value={row.endTime}
              onChange={(value) => updateRow({ endTime: normalizeOptionalText(value) })}
            />
            <NumberField
              label="Duración (min)"
              value={row.durationMinutes}
              onChange={(durationMinutes) => updateRow({ durationMinutes })}
            />
            <TextField label="Cabina" value={row.cabin} onChange={(value) => updateRow({ cabin: normalizeOptionalText(value) })} />
            <TextField
              label="Profesional legacy"
              value={row.legacyProfessionalCode}
              onChange={(value) => updateRow({ legacyProfessionalCode: normalizeOptionalText(value) })}
            />
            <TextField
              label="Nombre profesional"
              value={row.legacyProfessionalName}
              onChange={(value) => updateRow({ legacyProfessionalName: normalizeOptionalText(value) })}
            />
            <TextField
              label="Profesional secundario"
              value={row.secondaryProfessionalCode}
              onChange={(value) => updateRow({ secondaryProfessionalCode: normalizeOptionalText(value) })}
            />
            <TextField label="Estado" value={row.status} onChange={(value) => updateRow({ status: normalizeOptionalText(value) })} />
            <TextField
              label="Pack legacy"
              value={row.legacyPackNumber}
              onChange={(value) => updateRow({ legacyPackNumber: normalizeOptionalText(value) })}
            />
            <SelectField
              label="Usuario Lucy"
              value={row.targetUserId}
              onChange={(targetUserId) => updateRow({ targetUserId })}
              options={userOptions}
            />
          </div>

          <TextAreaField label="Notas" value={row.notes} onChange={(value) => updateRow({ notes: normalizeOptionalText(value) })} />
        </div>
      )}
    />
  )
}
