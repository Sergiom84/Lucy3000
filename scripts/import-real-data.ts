import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

// ============================================
// SUPABASE REST API CONFIG
// ============================================

const SUPABASE_URL = 'https://mpyifvwqyakkmwdmtbhp.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to run this import script.')
}

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
}

async function supabaseDelete(table: string): Promise<number> {
  // Delete all rows by matching id != impossible value
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=neq.IMPOSSIBLE_ID_NEVER_MATCH`, {
    method: 'DELETE',
    headers: { ...headers, 'Prefer': 'return=representation,count=exact' },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`DELETE ${table} failed (${res.status}): ${body}`)
  }
  const count = res.headers.get('content-range')
  // Parse "*/123" or "0-122/123"
  const match = count?.match(/\/(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

async function supabaseCount(table: string): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=0`, {
    method: 'GET',
    headers: { ...headers, 'Prefer': 'count=exact' },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`COUNT ${table} failed (${res.status}): ${body}`)
  }
  const range = res.headers.get('content-range')
  const match = range?.match(/\/(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

async function supabaseInsert(table: string, rows: any[]): Promise<void> {
  if (rows.length === 0) return
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`INSERT ${table} failed (${res.status}): ${body}`)
  }
}

// ============================================
// CSV READING (UTF-16LE, tab-separated)
// ============================================

function readCSV(filePath: string): Record<string, string>[] {
  const buffer = fs.readFileSync(filePath)
  const text = buffer.toString('utf16le').replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []

  const hdrs = lines[0].split('\t').map(h => h.trim())
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t')
    const row: Record<string, string> = {}
    hdrs.forEach((h, idx) => {
      row[h] = (cols[idx] ?? '').trim()
    })
    rows.push(row)
  }
  return rows
}

// ============================================
// PARSE HELPERS
// ============================================

function parseDecimalES(val: string): number {
  if (!val || val.trim() === '') return 0
  return parseFloat(val.replace(',', '.')) || 0
}

function parseDecimalNullable(val: string): number | null {
  if (!val || val.trim() === '') return null
  const parsed = parseFloat(val.replace(',', '.'))
  return Number.isNaN(parsed) ? null : parsed
}

function normalizeBilledOutlier(value: number | null): number | null {
  if (value === null) return null
  if (value <= 10000) return value

  if (value < 1000000) return Math.trunc(value / 100)
  if (value < 5000000) return Math.trunc(value / 10000)
  return Math.trunc(value / 100000)
}

function parseInt0(val: string): number {
  if (!val || val.trim() === '') return 0
  return parseInt(val, 10) || 0
}

function parseIntNullable(val: string): number | null {
  if (!val || val.trim() === '') return null
  const parsed = parseInt(val, 10)
  return Number.isNaN(parsed) ? null : parsed
}

function textOrNull(val: string | undefined, treatAtAsNull = false): string | null {
  if (!val) return null
  const normalized = val.trim()
  if (!normalized) return null
  if (treatAtAsNull && normalized === '@') return null
  return normalized
}

function normalizeLegacyGender(val: string | undefined): 'HOMBRE' | 'MUJER' | null {
  const raw = textOrNull(val)
  if (!raw) return null
  const normalized = raw.toUpperCase()
  if (normalized === 'HOMBRE') return 'HOMBRE'
  if (normalized === 'MUJER') return 'MUJER'
  return null
}

function parseDateDMY(raw: string | undefined): string | null {
  if (!raw) return null
  const normalized = raw.trim()
  if (!normalized || normalized === '01-01-01') return null

  const parts = normalized.split('-')
  if (parts.length !== 3) return null

  const day = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10)
  const yyOrYear = parseInt(parts[2], 10)

  if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(yyOrYear)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const year = parts[2].length === 4
    ? yyOrYear
    : (yyOrYear <= 30 ? 2000 + yyOrYear : 1900 + yyOrYear)

  return new Date(year, month - 1, day).toISOString()
}

function parseBooleanFlag(val: string | undefined): boolean | null {
  if (!val) return null
  const normalized = val.trim().toLowerCase()
  if (!normalized) return null

  if (['true', '1', 's', 'si', 'sí', 'y', 'yes'].includes(normalized)) return true
  if (['false', '0', 'n', 'no'].includes(normalized)) return false

  return null
}

function parseBirthDate(row: Record<string, string>): string | null {
  const raw = row['Fecha de nacimiento']
  if (!raw || raw === '01-01-01' || raw.trim() === '') return null

  const parts = raw.split('-')
  if (parts.length !== 3) return null

  const day = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10)
  let year: number

  const yearCol = row['Año de nacimiento']
  if (yearCol && /^\d{4}$/.test(yearCol.trim())) {
    year = parseInt(yearCol.trim(), 10)
  } else {
    const yy = parseInt(parts[2], 10)
    year = yy <= 30 ? 2000 + yy : 1900 + yy
  }

  if (isNaN(day) || isNaN(month) || isNaN(year)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  return new Date(year, month - 1, day).toISOString()
}

function parseDuration(val: string): number {
  if (!val || val.trim() === '') return 30
  const first = val.split('-')[0].replace(/[^0-9]/g, '')
  const num = parseInt(first, 10)
  return isNaN(num) || num <= 0 ? 30 : num
}

function normalizeEmail(val: string): string | null {
  if (!val || val.trim() === '' || val.trim() === '@') return null
  const email = val.trim().toLowerCase()
  if (!email.includes('@') || !email.includes('.')) return null
  return email
}

// ============================================
// TRANSFORM: CLIENTS
// ============================================

function transformClients(rows: Record<string, string>[]) {
  const seenEmails = new Set<string>()
  const now = new Date().toISOString()

  return rows.map(row => {
    const clientNum = (row['NºCliente'] || '').trim()
    let firstName = (row['Nombre'] || '').trim()
    let lastName = (row['Apellidos'] || '').trim()

    if (!firstName && !lastName) {
      const full = (row['Nombre completo'] || '').trim()
      if (full.includes(',')) {
        const [last, first] = full.split(',', 2)
        lastName = (last || '').trim()
        firstName = (first || '').trim()
      } else {
        firstName = full
        lastName = 'SIN_APELLIDOS'
      }
    }

    if (!firstName) firstName = 'SIN_NOMBRE'
    if (!lastName) lastName = 'SIN_APELLIDOS'

    let phone = (row['Móvil'] || '').trim()
    if (!phone) phone = (row['Tfno'] || '').trim()
    if (!phone) phone = `NO_PHONE_${clientNum}`

    let email = normalizeEmail(row['eMail'] || '')
    if (email) {
      if (seenEmails.has(email)) {
        email = null
      } else {
        seenEmails.add(email)
      }
    }

    const birthDate = parseBirthDate(row)
    const billedAmount = normalizeBilledOutlier(parseDecimalNullable(row['Importe facturado']))
    const pendingAmount = parseDecimalNullable(row['Importe pendiente'])

    return {
      id: randomUUID(),
      firstName,
      lastName,
      email: email || null,
      phone,
      birthDate,
      address: textOrNull(row['Dirección']),
      city: textOrNull(row['Ciudad']),
      postalCode: textOrNull(row['CP']),
      province: textOrNull(row['Provincia']),
      landlinePhone: textOrNull(row['Tfno']),
      mobilePhone: textOrNull(row['Móvil']),
      fullName: textOrNull(row['Nombre completo']),
      externalCode: textOrNull(row['NºCliente']),
      dni: textOrNull(row['DNI']),
      gender: normalizeLegacyGender(row['Sexo']),
      registrationDate: parseDateDMY(row['Fecha de alta']),
      esthetician: textOrNull(row['esteticista'], true),
      clientBrand: textOrNull(row['Marca']),
      appliedTariff: textOrNull(row['Tarifa a aplicar']),
      text9A: textOrNull(row['Texto9A']),
      text9B: textOrNull(row['Texto9B']),
      text15: textOrNull(row['Texto15']),
      text25: textOrNull(row['Texto25']),
      text100: textOrNull(row['Texto100']),
      integer1: parseIntNullable(row['Entero1']),
      integer2: parseIntNullable(row['Entero2']),
      gifts: textOrNull(row['Obsequios']),
      birthDay: parseIntNullable(row['Día de nacimiento']),
      birthMonthNumber: parseIntNullable(row['Mes de Nacimiento 1']),
      birthMonthName: textOrNull(row['Mes de Nacimiento 2']),
      birthYear: parseIntNullable(row['Año de nacimiento']),
      lastVisit: parseDateDMY(row['Ultima visita']),
      serviceCount: parseIntNullable(row['Cantidad de servicios']),
      billedAmount,
      pendingAmount,
      discountProfile: textOrNull(row['Perfil de descuentos']),
      webKey: textOrNull(row['ClaveWeb']),
      notes: textOrNull(row['Nota']),
      photoUrl: null,
      loyaltyPoints: 0,
      totalSpent: billedAmount || 0,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }
  })
}

// ============================================
// TRANSFORM: PRODUCTS
// ============================================

function transformProducts(rows: Record<string, string>[]) {
  const now = new Date().toISOString()

  return rows.map(row => {
    const name = (row['Descripción'] || '').trim()
    const sku = (row['Prod'] || '').trim()
    const price = parseDecimalES(row['PVP'])

    const saleFlag = parseBooleanFlag(row['Prod. venta?'])

    return {
      id: randomUUID(),
      name: name || `Producto ${sku}`,
      description: null,
      sku,
      barcode: null,
      category: (row['Familia'] || '').trim() || 'Sin categoría',
      brand: (row['Marca'] || '').trim() || null,
      price,
      cost: price,
      stock: parseInt0(row['Cantidad']),
      minStock: parseInt0(row['Mínimo']) || 1,
      maxStock: parseInt0(row['Máximo']) || null,
      unit: 'unidad',
      isActive: saleFlag === null ? true : saleFlag,
      createdAt: now,
      updatedAt: now,
    }
  })
}

// ============================================
// TRANSFORM: SERVICES (TRATAMIENTOS)
// ============================================

function transformServices(rows: Record<string, string>[]) {
  const now = new Date().toISOString()
  const services: any[] = []
  let currentCategory = 'Sin categoría'

  for (const row of rows) {
    const code = (row['Código'] || '').trim()
    const desc = (row['Descripción'] || '').trim()
    const tarifa = (row['Tarifa 1'] || '').trim()

    if (code === '˄˅' || code === '\u02C4\u02C5') {
      if (desc) currentCategory = desc
      continue
    }

    if (!code || !desc) continue
    if (tarifa === 'Tarifa 1') continue

    services.push({
      id: randomUUID(),
      name: desc,
      description: `Código: ${code}`,
      price: parseDecimalES(tarifa),
      duration: parseDuration(row['Tiempo']),
      category: currentCategory,
      serviceCode: code,
      taxRate: parseDecimalNullable(row['IVA']),
      requiresProduct: parseBooleanFlag(row['Pedir producto']),
      commission: textOrNull(row['Comisión']),
      promo: textOrNull(row['Promo']),
      legacyRole: textOrNull(row['ROL']),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
  }

  return services
}

// ============================================
// MAIN
// ============================================

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  const basePath = args.find(a => a.startsWith('--base='))?.split('=')[1]
    || '/mnt/c/Users/sergi/Desktop/Tamara/BD'

  const clientsPath = path.join(basePath, 'clientes.csv')
  const productsPath = path.join(basePath, 'Productos.csv')
  const servicesPath = path.join(basePath, 'Tratamientos.csv')

  console.log('=== IMPORT REAL DATA (Supabase REST API) ===')
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'APPLY'}`)
  console.log(`Base path: ${basePath}`)
  console.log()

  for (const f of [clientsPath, productsPath, servicesPath]) {
    if (!fs.existsSync(f)) {
      console.error(`File not found: ${f}`)
      process.exit(1)
    }
  }

  console.log('Reading CSV files...')
  const clientRows = readCSV(clientsPath)
  const productRows = readCSV(productsPath)
  const serviceRows = readCSV(servicesPath)

  console.log(`  clientes.csv: ${clientRows.length} rows`)
  console.log(`  Productos.csv: ${productRows.length} rows`)
  console.log(`  Tratamientos.csv: ${serviceRows.length} rows`)
  console.log()

  console.log('Transforming data...')
  const clients = transformClients(clientRows)
  const products = transformProducts(productRows)
  const services = transformServices(serviceRows)

  console.log(`  Clients to import: ${clients.length}`)
  console.log(`  Products to import: ${products.length}`)
  console.log(`  Services to import: ${services.length}`)
  console.log()

  // Stats
  const noPhoneClients = clients.filter(c => c.phone.startsWith('NO_PHONE_')).length
  const nullEmailClients = clients.filter(c => !c.email).length
  const nullBirthClients = clients.filter(c => !c.birthDate).length
  const negativeStockProducts = products.filter(p => p.stock < 0).length
  const inactiveProducts = products.filter(p => !p.isActive).length
  const categories = [...new Set(services.map(s => s.category))]

  console.log('--- Stats ---')
  console.log(`  Clients without phone (placeholder): ${noPhoneClients}`)
  console.log(`  Clients without email: ${nullEmailClients}`)
  console.log(`  Clients without birth date: ${nullBirthClients}`)
  console.log(`  Products with negative stock: ${negativeStockProducts}`)
  console.log(`  Inactive products: ${inactiveProducts}`)
  console.log(`  Service categories: ${categories.length} (${categories.join(', ')})`)
  console.log()

  if (dryRun) {
    console.log('DRY RUN complete. No data was written.')
    console.log()
    console.log('Sample clients:')
    clients.slice(0, 3).forEach(c => console.log(`  ${c.firstName} ${c.lastName} | ${c.phone} | ${c.email || 'N/A'}`))
    console.log('Sample products:')
    products.slice(0, 3).forEach(p => console.log(`  ${p.sku}: ${p.name} | ${p.brand} | €${p.price} | stock: ${p.stock}`))
    console.log('Sample services:')
    services.slice(0, 3).forEach(s => console.log(`  ${s.name} | ${s.category} | €${s.price} | ${s.duration}min`))
    return
  }

  // === APPLY MODE ===
  console.log('Checking current state of database...')

  const counts = await Promise.all([
    supabaseCount('appointments'),
    supabaseCount('sales'),
    supabaseCount('sale_items'),
    supabaseCount('stock_movements'),
    supabaseCount('client_history'),
    supabaseCount('services'),
    supabaseCount('products'),
    supabaseCount('clients'),
  ])

  console.log(`  Appointments: ${counts[0]}`)
  console.log(`  Sales: ${counts[1]}`)
  console.log(`  Sale items: ${counts[2]}`)
  console.log(`  Stock movements: ${counts[3]}`)
  console.log(`  Client history: ${counts[4]}`)
  console.log(`  Current services: ${counts[5]}`)
  console.log(`  Current products: ${counts[6]}`)
  console.log(`  Current clients: ${counts[7]}`)

  if (counts[0] + counts[1] + counts[2] + counts[3] + counts[4] > 0) {
    console.log('\nWARNING: Related records exist. Deleting them first...')
    await supabaseDelete('sale_items')
    console.log('  Deleted sale_items')
    await supabaseDelete('sales')
    console.log('  Deleted sales')
    await supabaseDelete('appointments')
    console.log('  Deleted appointments')
    await supabaseDelete('stock_movements')
    console.log('  Deleted stock_movements')
    await supabaseDelete('client_history')
    console.log('  Deleted client_history')
  }

  console.log()
  console.log('Deleting existing data...')

  if (counts[5] > 0) {
    await supabaseDelete('services')
    console.log(`  Deleted services`)
  }
  if (counts[6] > 0) {
    await supabaseDelete('products')
    console.log(`  Deleted products`)
  }
  if (counts[7] > 0) {
    await supabaseDelete('clients')
    console.log(`  Deleted clients`)
  }

  console.log()
  console.log('Inserting new data...')

  // Insert in batches (Supabase REST API handles ~1000 rows well per request)
  const CHUNK = 500

  console.log('  Inserting services...')
  for (let i = 0; i < services.length; i += CHUNK) {
    const chunk = services.slice(i, i + CHUNK)
    await supabaseInsert('services', chunk)
    console.log(`    batch ${Math.floor(i / CHUNK) + 1}: ${chunk.length} rows`)
  }

  console.log('  Inserting products...')
  for (let i = 0; i < products.length; i += CHUNK) {
    const chunk = products.slice(i, i + CHUNK)
    await supabaseInsert('products', chunk)
    console.log(`    batch ${Math.floor(i / CHUNK) + 1}: ${chunk.length} rows`)
  }

  console.log('  Inserting clients...')
  for (let i = 0; i < clients.length; i += CHUNK) {
    const chunk = clients.slice(i, i + CHUNK)
    await supabaseInsert('clients', chunk)
    console.log(`    batch ${Math.floor(i / CHUNK) + 1}: ${chunk.length} rows`)
  }

  // Final verification
  console.log()
  console.log('=== VERIFICATION ===')
  const [finalClients, finalProducts, finalServices] = await Promise.all([
    supabaseCount('clients'),
    supabaseCount('products'),
    supabaseCount('services'),
  ])
  console.log(`  Clients: ${finalClients}`)
  console.log(`  Products: ${finalProducts}`)
  console.log(`  Services: ${finalServices}`)
  console.log()
  console.log('Import complete!')
}

main().catch((e) => {
  console.error('FATAL ERROR:', e)
  process.exit(1)
})
