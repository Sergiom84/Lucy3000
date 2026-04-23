import { Prisma } from '@prisma/client'
import type { AuthRequest } from '../../middleware/auth.middleware'
import { prisma } from '../../db'
import { notifyAdminsAboutResourceCreation } from '../../utils/notifications'
import { loadWorkbookFromBuffer, worksheetToObjects } from '../../utils/spreadsheet'
import { ClientModuleError } from './errors'
import { normalizeClientPayload } from './shared'
import {
  addClientIdentityToLookup,
  addClientReferenceToLookup,
  buildNormalizedRow,
  findExistingClientIdForImport,
  getRowValue,
  normalizeColumnKey,
  parseBooleanValue,
  parseExcelDate,
  resolveBirthMetadata,
  textOrNull
} from './spreadsheet'

export const importClientsSpreadsheet = async ({
  buffer,
  user
}: {
  buffer: Buffer
  user?: AuthRequest['user']
}) => {
  const workbook = await loadWorkbookFromBuffer(buffer)
  const worksheet = workbook.worksheets[0]

  if (!worksheet) {
    throw new ClientModuleError(400, 'No worksheet found in the uploaded file')
  }

  const data = worksheetToObjects(worksheet)

  const results = {
    success: 0,
    errors: [] as { row: number; error: string }[],
    skipped: 0
  }

  const linkedClientLookup = new Map<string, string>()
  const identityLookup = new Map<string, string>()
  const pendingLinks: Array<{ clientId: string; reference: string }> = []

  const existingClients = await prisma.client.findMany({
    select: {
      id: true,
      externalCode: true,
      dni: true,
      email: true,
      phone: true,
      mobilePhone: true,
      landlinePhone: true,
      firstName: true,
      lastName: true
    }
  })

  for (const client of existingClients) {
    addClientReferenceToLookup(linkedClientLookup, client)
    addClientIdentityToLookup(identityLookup, client)
  }

  for (let i = 0; i < data.length; i++) {
    const row = buildNormalizedRow(data[i] || {})

    try {
      let firstName = textOrNull(getRowValue(row, ['Nombre', 'firstName'])) || ''
      let lastName = textOrNull(getRowValue(row, ['Apellidos', 'lastName'])) || ''

      if (!firstName && !lastName) {
        results.errors.push({ row: i + 2, error: 'Faltan Nombre y Apellidos' })
        results.skipped++
        continue
      }

      if (!firstName) firstName = 'SIN_NOMBRE'
      if (!lastName) lastName = 'SIN_APELLIDOS'

      const externalCode = textOrNull(
        getRowValue(row, ['Nº Cliente', 'NCliente', 'Numero cliente', 'externalCode', 'Codigo cliente'])
      )

      const phone =
        textOrNull(getRowValue(row, ['Teléfono principal', 'Telefono principal', 'Telefono', 'phone'])) ||
        textOrNull(getRowValue(row, ['Móvil', 'Movil', 'mobilePhone'])) ||
        textOrNull(getRowValue(row, ['Teléfono fijo', 'Telefono fijo', 'landlinePhone'])) ||
        `NO_PHONE_${externalCode || i}`

      const mobilePhone = textOrNull(getRowValue(row, ['Móvil', 'Movil', 'mobilePhone']))
      const landlinePhone = textOrNull(getRowValue(row, ['Teléfono fijo', 'Telefono fijo', 'landlinePhone']))

      const emailRaw = textOrNull(getRowValue(row, ['Email', 'eMail', 'Correo electrónico', 'correo', 'mail']))
      const email = emailRaw && emailRaw.includes('@') && emailRaw.includes('.') ? emailRaw.toLowerCase() : null

      const dni = textOrNull(getRowValue(row, ['DNI', 'dni']))
      const existingClientId = findExistingClientIdForImport(identityLookup, {
        externalCode,
        dni,
        email,
        firstName,
        lastName,
        phone,
        mobilePhone,
        landlinePhone
      })

      if (existingClientId) {
        results.skipped++
        continue
      }

      const billedRaw = getRowValue(row, ['Importe facturado', 'billedAmount', 'Total facturado'])
      const pendingRaw = getRowValue(row, ['Importe pendiente', 'pendingAmount', 'Deuda'])
      const accountBalanceRaw = getRowValue(row, ['Saldo a cuenta', 'accountBalance', 'Abono'])
      const birthMetadata = resolveBirthMetadata(row)
      const linkedClientReference = textOrNull(
        getRowValue(row, ['Cliente vinculado', 'Enlazar cliente', 'Referencia cliente vinculado', 'linkedClientReference'])
      )
      const debtAlertEnabled = parseBooleanValue(
        getRowValue(row, ['Avisar deuda', 'Alerta deuda', 'debtAlertEnabled'])
      )
      const isActive = parseBooleanValue(getRowValue(row, ['Cliente activo', 'Activo', 'isActive']))

      const clientPayload = normalizeClientPayload({
        externalCode,
        dni,
        firstName,
        lastName,
        email,
        phone,
        mobilePhone,
        landlinePhone,
        gender: getRowValue(row, ['Sexo', 'gender']),
        birthDate: birthMetadata.birthDate,
        birthDay: birthMetadata.birthDay,
        birthMonthNumber: birthMetadata.birthMonthNumber,
        birthMonthName: birthMetadata.birthMonthName,
        birthYear: birthMetadata.birthYear,
        registrationDate: parseExcelDate(getRowValue(row, ['Fecha de alta', 'registrationDate'])),
        lastVisit: parseExcelDate(getRowValue(row, ['Última visita', 'Ultima visita', 'lastVisit'])),
        address: getRowValue(row, ['Dirección', 'Direccion', 'address']),
        city: getRowValue(row, ['Ciudad', 'city']),
        postalCode: getRowValue(row, ['CP', 'Código postal', 'Codigo postal', 'postalCode']),
        province: getRowValue(row, ['Provincia', 'province']),
        notes: getRowValue(row, ['Notas', 'Nota', 'Observaciones', 'notes']),
        allergies: getRowValue(row, ['Alergias', 'allergies']),
        gifts: getRowValue(row, ['Obsequios', 'gifts']),
        activeTreatmentCount: getRowValue(row, [
          'Nº tratamientos activos',
          'Numero tratamientos activos',
          'Número de Tratamientos activos',
          'Numero de tratamientos activos',
          'activeTreatmentCount'
        ]),
        activeTreatmentNames: getRowValue(row, [
          'Tratamientos activos',
          'Nombre de los tratamientos activos',
          'Nombre tratamientos activos',
          'activeTreatmentNames'
        ]),
        bondCount: getRowValue(row, [
          'Nº abonos',
          'Numero abonos',
          'Número de abonos',
          'Numero de abonos',
          'bondCount'
        ]),
        giftVoucher: getRowValue(row, ['Cheque regalo', 'giftVoucher']),
        serviceCount: getRowValue(row, ['Cantidad de servicios', 'Número de servicios', 'Numero de servicios', 'serviceCount']),
        accountBalance: accountBalanceRaw,
        billedAmount: billedRaw,
        totalSpent: billedRaw,
        pendingAmount: pendingRaw,
        debtAlertEnabled: debtAlertEnabled ?? undefined,
        linkedClientReference,
        relationshipType: getRowValue(row, ['Parentesco', 'Tipo de relación', 'Tipo de relacion', 'relationshipType']),
        isActive: isActive ?? true
      })

      const createdClient = await prisma.client.create({
        data: clientPayload as Prisma.ClientCreateInput
      })

      addClientReferenceToLookup(linkedClientLookup, createdClient)
      addClientIdentityToLookup(identityLookup, createdClient)

      if (linkedClientReference) {
        pendingLinks.push({
          clientId: createdClient.id,
          reference: linkedClientReference
        })
      }

      results.success++
    } catch (error: any) {
      results.errors.push({ row: i + 2, error: error.message })
      results.skipped++
    }
  }

  for (const pendingLink of pendingLinks) {
    const linkedClientId = linkedClientLookup.get(normalizeColumnKey(pendingLink.reference))
    if (!linkedClientId || linkedClientId === pendingLink.clientId) continue

    await prisma.client.update({
      where: { id: pendingLink.clientId },
      data: { linkedClientId }
    })
  }

  await notifyAdminsAboutResourceCreation(user, 'client', results.success)

  return { message: 'Import completed', results }
}
