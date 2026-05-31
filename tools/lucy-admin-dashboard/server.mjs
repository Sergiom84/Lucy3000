import express from 'express'
import dotenv from 'dotenv'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')

dotenv.config({ path: resolve(repoRoot, '.env') })
dotenv.config({ path: resolve(repoRoot, '.env.admin.local'), override: true })
dotenv.config({ path: resolve(__dirname, '.env.local'), override: true })

const args = new Set(process.argv.slice(2))
const portArgIndex = process.argv.indexOf('--port')
const hostArgIndex = process.argv.indexOf('--host')
const port =
  portArgIndex >= 0 && process.argv[portArgIndex + 1]
    ? Number(process.argv[portArgIndex + 1])
    : Number(process.env.LUCY_ADMIN_PORT || 3999)
const host =
  hostArgIndex >= 0 && process.argv[hostArgIndex + 1]
    ? process.argv[hostArgIndex + 1]
    : process.env.LUCY_ADMIN_HOST || '127.0.0.1'
const configPath = resolve(
  process.env.LUCY_ADMIN_CONFIG || resolve(__dirname, 'clients.local.json')
)
const adminToken = process.env.LUCY_ADMIN_TOKEN || ''

const prismaByClientId = new Map()

const redact = (value) =>
  String(value || '').replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, 'postgres://[redacted]@')

const toJson = (value) =>
  JSON.parse(
    JSON.stringify(value, (_key, item) => {
      if (typeof item === 'bigint') {
        const asNumber = Number(item)
        return Number.isSafeInteger(asNumber) ? asNumber : item.toString()
      }
      return item
    })
  )

const slugify = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

function loadRawConfig() {
  if (!existsSync(configPath)) {
    return { clients: [] }
  }

  const raw = readFileSync(configPath, 'utf8')
  const parsed = JSON.parse(raw)

  return {
    ...parsed,
    clients: Array.isArray(parsed.clients) ? parsed.clients : []
  }
}

function saveRawConfig(config) {
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

function loadConfig() {
  const missingConfig = !existsSync(configPath)
  const parsed = loadRawConfig()
  const clients = Array.isArray(parsed.clients) ? parsed.clients : []

  return {
    clients: clients.map((client, index) => {
      const id = slugify(client.id || client.label || client.businessName || `client-${index + 1}`)
      const databaseUrl = client.databaseUrl || (client.databaseUrlEnv ? process.env[client.databaseUrlEnv] : '')
      return {
        id,
        label: client.label || client.businessName || id,
        businessName: client.businessName || client.label || id,
        contactName: client.contactName || '',
        contactEmail: client.contactEmail || '',
        phone: client.phone || '',
        address: client.address || '',
        notes: client.notes || '',
        supabaseUrl: client.supabaseUrl || '',
        dashboardUrl: client.dashboardUrl || '',
        tenantId: client.tenantId || '',
        databaseUrl,
        databaseUrlEnv: client.databaseUrlEnv || ''
      }
    }),
    configPath,
    missingConfig
  }
}

function upsertConfiguredClient(input) {
  const current = loadRawConfig()
  const clients = Array.isArray(current.clients) ? current.clients : []
  const businessName = String(input.businessName || input.label || '').trim()
  const id = slugify(input.id || businessName)

  if (!businessName || !id) {
    throw new Error('Business name is required')
  }

  const databaseUrl = String(input.databaseUrl || '').trim()
  if (databaseUrl && !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw new Error('Pooler URL must start with postgresql:// or postgres://')
  }

  const existingIndex = clients.findIndex((client) => slugify(client.id || client.businessName) === id)
  const existing = existingIndex >= 0 ? clients[existingIndex] : {}
  const nextClient = {
    ...existing,
    id,
    label: String(input.label || businessName).trim(),
    businessName,
    contactName: String(input.contactName || '').trim(),
    contactEmail: String(input.contactEmail || '').trim(),
    phone: String(input.phone || '').trim(),
    address: String(input.address || '').trim(),
    notes: String(input.notes || '').trim(),
    supabaseUrl: String(input.supabaseUrl || '').trim(),
    dashboardUrl: String(input.dashboardUrl || '').trim(),
    tenantId: String(input.tenantId || '').trim(),
    databaseUrl: databaseUrl || existing.databaseUrl || '',
    databaseUrlEnv: databaseUrl ? '' : String(existing.databaseUrlEnv || input.databaseUrlEnv || '').trim()
  }

  if (existingIndex >= 0) {
    clients[existingIndex] = nextClient
  } else {
    clients.push(nextClient)
  }

  saveRawConfig({
    ...current,
    clients
  })

  return nextClient
}

function getPrismaClient(clientConfig) {
  if (!clientConfig.databaseUrl) return null

  const cached = prismaByClientId.get(clientConfig.id)
  if (cached?.databaseUrl === clientConfig.databaseUrl) {
    return cached.prisma
  }

  if (cached?.prisma) {
    void cached.prisma.$disconnect().catch(() => {})
  }

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: clientConfig.databaseUrl
      }
    },
    log: ['error']
  })

  prismaByClientId.set(clientConfig.id, {
    databaseUrl: clientConfig.databaseUrl,
    prisma
  })

  return prisma
}

function evaluateStatus(row) {
  const status = row.licenseStatus || row.licenseStoredStatus || 'INACTIVE'
  const reason = row.licenseReason || 'inactive'
  return { status, reason }
}

async function fetchClientSnapshot(clientConfig) {
  if (!clientConfig.databaseUrl) {
    return {
      ...publicClientConfig(clientConfig),
      connected: false,
      error: clientConfig.databaseUrlEnv
        ? `Missing env var ${clientConfig.databaseUrlEnv}`
        : 'Missing databaseUrl or databaseUrlEnv',
      tenants: []
    }
  }

  const prisma = getPrismaClient(clientConfig)
  const tenantFilter = clientConfig.tenantId
    ? Prisma.sql`WHERE t.id = ${clientConfig.tenantId}`
    : Prisma.empty

  try {
    const rows = await prisma.$queryRaw`
      SELECT
        NOW() AS "serverNow",
        t.id,
        t.name,
        t.slug,
        t.status AS "tenantStatus",
        t."createdAt",
        t."updatedAt",
        l.id AS "licenseId",
        l.status AS "licenseStoredStatus",
        l.plan,
        l."trialEndsAt",
        l."activatedAt",
        l."blockedAt",
        l."cancelledAt",
        l.notes AS "licenseNotes",
        CASE
          WHEN l."blockedAt" IS NOT NULL OR l.status = 'BLOCKED' THEN 'BLOCKED'
          WHEN l."cancelledAt" IS NOT NULL OR l.status = 'CANCELLED' THEN 'CANCELLED'
          WHEN l.status = 'PENDING' THEN 'PENDING'
          WHEN l.status = 'TRIAL' AND l."trialEndsAt" < NOW() THEN 'TRIAL_EXPIRED'
          WHEN l.status IN ('ACTIVE', 'TRIAL') THEN l.status
          ELSE COALESCE(l.status, 'INACTIVE')
        END AS "licenseStatus",
        CASE
          WHEN l."blockedAt" IS NOT NULL OR l.status = 'BLOCKED' THEN 'blocked'
          WHEN l."cancelledAt" IS NOT NULL OR l.status = 'CANCELLED' THEN 'cancelled'
          WHEN l.status = 'PENDING' AND l."createdAt" + INTERVAL '9 days' < NOW() THEN 'pending-expired'
          WHEN l.status = 'PENDING' THEN 'pending'
          WHEN l.status = 'TRIAL' AND l."trialEndsAt" < NOW() THEN 'trial-expired'
          WHEN l.status IN ('ACTIVE', 'TRIAL') THEN 'active'
          ELSE 'inactive'
        END AS "licenseReason",
        COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', u.id,
                'email', u.email,
                'username', u.username,
                'name', u.name,
                'role', u.role,
                'isActive', u."isActive",
                'isPlatformAdmin', u."isPlatformAdmin"
              )
              ORDER BY u."createdAt" ASC
            )
            FROM users u
            WHERE u."tenantId" = t.id
          ),
          '[]'::jsonb
        ) AS users,
        (SELECT COUNT(*)::int FROM clients c WHERE c."tenantId" = t.id) AS "clientsCount",
        (SELECT COUNT(*)::int FROM appointments a WHERE a."tenantId" = t.id) AS "appointmentsCount",
        (SELECT COUNT(*)::int FROM sales s WHERE s."tenantId" = t.id) AS "salesCount"
      FROM tenants t
      LEFT JOIN tenant_licenses l ON l."tenantId" = t.id
      ${tenantFilter}
      ORDER BY t."createdAt" DESC
    `

    return {
      ...publicClientConfig(clientConfig),
      connected: true,
      error: '',
      tenants: rows.map((row) => {
        const { status, reason } = evaluateStatus(row)
        const users = Array.isArray(row.users) ? row.users : []
        const admins = users.filter((user) => user.role === 'ADMIN')
        return {
          id: row.id,
          name: row.name,
          slug: row.slug,
          tenantStatus: row.tenantStatus,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          serverNow: row.serverNow,
          license: {
            id: row.licenseId,
            status,
            storedStatus: row.licenseStoredStatus,
            reason,
            plan: row.plan,
            trialEndsAt: row.trialEndsAt,
            activatedAt: row.activatedAt,
            blockedAt: row.blockedAt,
            cancelledAt: row.cancelledAt,
            notes: row.licenseNotes
          },
          admins,
          users,
          counts: {
            clients: row.clientsCount,
            appointments: row.appointmentsCount,
            sales: row.salesCount
          }
        }
      })
    }
  } catch (error) {
    return {
      ...publicClientConfig(clientConfig),
      connected: false,
      error: redact(error?.message || 'Connection failed'),
      tenants: []
    }
  }
}

function publicClientConfig(clientConfig) {
  return {
    id: clientConfig.id,
    label: clientConfig.label,
    businessName: clientConfig.businessName,
    contactName: clientConfig.contactName,
    contactEmail: clientConfig.contactEmail,
    phone: clientConfig.phone,
    address: clientConfig.address,
    notes: clientConfig.notes,
    supabaseUrl: clientConfig.supabaseUrl,
    dashboardUrl: clientConfig.dashboardUrl,
    tenantId: clientConfig.tenantId,
    hasConnection: Boolean(clientConfig.databaseUrl)
  }
}

function totalsFromSnapshots(snapshots) {
  const totals = {
    configured: snapshots.length,
    connected: 0,
    pending: 0,
    trial: 0,
    active: 0,
    blocked: 0,
    cancelled: 0,
    expired: 0
  }

  for (const snapshot of snapshots) {
    if (snapshot.connected) totals.connected += 1
    for (const tenant of snapshot.tenants) {
      const status = tenant.license?.status
      if (status === 'PENDING') totals.pending += 1
      else if (status === 'TRIAL') totals.trial += 1
      else if (status === 'ACTIVE') totals.active += 1
      else if (status === 'BLOCKED') totals.blocked += 1
      else if (status === 'CANCELLED') totals.cancelled += 1
      else if (status === 'TRIAL_EXPIRED') totals.expired += 1
    }
  }

  return totals
}

async function runLicenseAction(clientConfig, tenantId, action) {
  const prisma = getPrismaClient(clientConfig)
  if (!prisma) {
    throw new Error('Client connection is not configured')
  }

  const id = randomUUID()

  if (action === 'startTrial') {
    return prisma.$queryRaw`
      INSERT INTO tenant_licenses (
        id, "tenantId", status, plan, "trialEndsAt",
        "activatedAt", "blockedAt", "cancelledAt", "createdAt", "updatedAt"
      )
      VALUES (
        ${id}, ${tenantId}, 'TRIAL', 'trial', NOW() + INTERVAL '7 days',
        NULL, NULL, NULL, NOW(), NOW()
      )
      ON CONFLICT ("tenantId") DO UPDATE
      SET status = 'TRIAL',
          plan = 'trial',
          "trialEndsAt" = NOW() + INTERVAL '7 days',
          "activatedAt" = NULL,
          "blockedAt" = NULL,
          "cancelledAt" = NULL,
          "updatedAt" = NOW()
      RETURNING *
    `
  }

  if (action === 'activate') {
    return prisma.$queryRaw`
      INSERT INTO tenant_licenses (
        id, "tenantId", status, plan, "trialEndsAt",
        "activatedAt", "blockedAt", "cancelledAt", "createdAt", "updatedAt"
      )
      VALUES (
        ${id}, ${tenantId}, 'ACTIVE', 'pro', NOW(),
        NOW(), NULL, NULL, NOW(), NOW()
      )
      ON CONFLICT ("tenantId") DO UPDATE
      SET status = 'ACTIVE',
          plan = 'pro',
          "activatedAt" = NOW(),
          "blockedAt" = NULL,
          "cancelledAt" = NULL,
          "updatedAt" = NOW()
      RETURNING *
    `
  }

  if (action === 'block') {
    return prisma.$queryRaw`
      INSERT INTO tenant_licenses (
        id, "tenantId", status, plan, "trialEndsAt",
        "activatedAt", "blockedAt", "cancelledAt", "createdAt", "updatedAt"
      )
      VALUES (
        ${id}, ${tenantId}, 'BLOCKED', 'blocked', NOW(),
        NULL, NOW(), NULL, NOW(), NOW()
      )
      ON CONFLICT ("tenantId") DO UPDATE
      SET status = 'BLOCKED',
          "blockedAt" = NOW(),
          "cancelledAt" = NULL,
          "updatedAt" = NOW()
      RETURNING *
    `
  }

  if (action === 'cancel') {
    return prisma.$queryRaw`
      INSERT INTO tenant_licenses (
        id, "tenantId", status, plan, "trialEndsAt",
        "activatedAt", "blockedAt", "cancelledAt", "createdAt", "updatedAt"
      )
      VALUES (
        ${id}, ${tenantId}, 'CANCELLED', 'cancelled', NOW(),
        NULL, NULL, NOW(), NOW(), NOW()
      )
      ON CONFLICT ("tenantId") DO UPDATE
      SET status = 'CANCELLED',
          "blockedAt" = NULL,
          "cancelledAt" = NOW(),
          "updatedAt" = NOW()
      RETURNING *
    `
  }

  throw new Error('Unknown action')
}

function assertLocalHost() {
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !adminToken) {
    throw new Error(
      'Refusing to bind outside localhost without LUCY_ADMIN_TOKEN. Set a token or use --host 127.0.0.1.'
    )
  }
}

function requireToken(req, res, next) {
  if (!adminToken) {
    next()
    return
  }

  const headerToken = req.get('x-lucy-admin-token')
  const bearerToken = req.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (headerToken === adminToken || bearerToken === adminToken) {
    next()
    return
  }

  res.status(401).json({ error: 'Admin token required' })
}

async function disconnectAll() {
  await Promise.all(
    Array.from(prismaByClientId.values()).map(({ prisma }) => prisma.$disconnect().catch(() => {}))
  )
}

if (args.has('--check-config')) {
  const config = loadConfig()
  const missing = config.clients.filter((client) => !client.databaseUrl)
  console.log(`Config: ${config.configPath}`)
  console.log(`Configured clients: ${config.clients.length}`)
  if (config.missingConfig) {
    console.log('Missing clients.local.json. Copy clients.example.json and fill private values.')
    process.exit(1)
  }
  if (missing.length > 0) {
    console.log(`Missing connection strings: ${missing.map((client) => client.id).join(', ')}`)
    process.exit(1)
  }
  console.log('Config OK')
  process.exit(0)
}

assertLocalHost()

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '64kb' }))

app.get('/', (_req, res) => {
  res.type('html').send(renderHtml(Boolean(adminToken)))
})

app.get('/api/clients', requireToken, async (_req, res) => {
  const config = loadConfig()
  const snapshots = await Promise.all(config.clients.map(fetchClientSnapshot))
  res.json(
    toJson({
      configPath: config.configPath,
      missingConfig: config.missingConfig,
      clients: snapshots,
      totals: totalsFromSnapshots(snapshots)
    })
  )
})

app.post('/api/client-config', requireToken, (req, res) => {
  try {
    const clientConfig = upsertConfiguredClient(req.body || {})
    res.status(201).json(toJson({ ok: true, client: publicClientConfig(clientConfig) }))
  } catch (error) {
    res.status(400).json({ error: error?.message || 'Could not save client configuration' })
  }
})

app.post('/api/license-action', requireToken, async (req, res) => {
  const { clientId, tenantId, action } = req.body || {}
  const config = loadConfig()
  const clientConfig = config.clients.find((client) => client.id === clientId)

  if (!clientConfig) {
    res.status(404).json({ error: 'Configured client not found' })
    return
  }

  if (!tenantId || typeof tenantId !== 'string') {
    res.status(400).json({ error: 'tenantId is required' })
    return
  }

  if (!['startTrial', 'activate', 'block', 'cancel'].includes(action)) {
    res.status(400).json({ error: 'Invalid action' })
    return
  }

  try {
    await runLicenseAction(clientConfig, tenantId, action)
    const snapshot = await fetchClientSnapshot(clientConfig)
    res.json(toJson({ ok: true, client: snapshot }))
  } catch (error) {
    res.status(500).json({ error: redact(error?.message || 'Action failed') })
  }
})

const server = app.listen(port, host, () => {
  console.log(`Lucy3000 admin dashboard: http://${host}:${port}`)
  console.log(`Config: ${configPath}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    server.close()
    await disconnectAll()
    process.exit(0)
  })
}

function renderHtml(tokenEnabled) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lucy3000 Panel interno</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f8fb;
        --panel: #ffffff;
        --line: #dbe2ea;
        --text: #172033;
        --muted: #64748b;
        --blue: #2563eb;
        --green: #0f9f6e;
        --amber: #c76a00;
        --red: #dc2626;
        --slate: #475569;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: var(--bg);
        color: var(--text);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(1380px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 24px 0 32px;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 18px;
      }
      h1 {
        margin: 0;
        font-size: 25px;
        line-height: 1.2;
        letter-spacing: 0;
      }
      .subtitle {
        margin: 4px 0 0;
        color: var(--muted);
        font-size: 14px;
      }
      .toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      button, .link-button {
        border: 1px solid transparent;
        border-radius: 8px;
        padding: 9px 12px;
        font: inherit;
        font-size: 14px;
        font-weight: 650;
        cursor: pointer;
        text-decoration: none;
        transition: transform 120ms ease, background 120ms ease, opacity 120ms ease;
      }
      button:active, .link-button:active { transform: translateY(1px); }
      button:disabled { cursor: not-allowed; opacity: 0.55; }
      .btn-secondary {
        background: #e8edf4;
        color: #132033;
      }
      .btn-trial { background: var(--blue); color: #fff; }
      .btn-active { background: var(--green); color: #fff; }
      .btn-block { background: var(--amber); color: #fff; }
      .btn-cancel { background: var(--red); color: #fff; }
      .btn-link {
        background: #eef2f7;
        color: #1f2937;
        border-color: #dbe2ea;
      }
      .metrics {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 18px;
      }
      .metric {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 12px;
        min-height: 76px;
      }
      .metric span {
        display: block;
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
      }
      .metric strong {
        display: block;
        margin-top: 6px;
        font-size: 26px;
      }
      .form-panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 14px;
        margin-bottom: 18px;
      }
      .form-title {
        margin: 0 0 12px;
        font-size: 15px;
        font-weight: 780;
      }
      .client-form {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
      }
      label {
        display: grid;
        gap: 5px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
      }
      input, textarea {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 9px 10px;
        color: var(--text);
        background: #fff;
        font: inherit;
        font-size: 14px;
        letter-spacing: 0;
      }
      textarea {
        min-height: 38px;
        resize: vertical;
      }
      .span-2 { grid-column: span 2; }
      .span-4 { grid-column: 1 / -1; }
      .form-actions {
        display: flex;
        align-items: end;
        gap: 8px;
      }
      .form-status {
        color: var(--muted);
        font-size: 13px;
        min-height: 18px;
      }
      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        overflow: hidden;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        padding: 13px 12px;
        border-bottom: 1px solid var(--line);
        text-align: left;
        vertical-align: top;
        font-size: 14px;
      }
      th {
        background: #eef2f7;
        color: #526174;
        font-size: 12px;
        text-transform: uppercase;
      }
      tr:last-child td { border-bottom: 0; }
      .name {
        font-weight: 760;
        font-size: 15px;
      }
      .muted {
        color: var(--muted);
        font-size: 12px;
        margin-top: 4px;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        min-height: 26px;
        padding: 3px 9px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 750;
        white-space: nowrap;
      }
      .status-PENDING { background: #fff3d6; color: #914b00; }
      .status-TRIAL { background: #dceafe; color: #1d4ed8; }
      .status-ACTIVE { background: #dff8ea; color: #08734f; }
      .status-TRIAL_EXPIRED { background: #ffe4c7; color: #a54700; }
      .status-BLOCKED { background: #ffe1e1; color: #b91c1c; }
      .status-CANCELLED, .status-INACTIVE { background: #e5e7eb; color: #374151; }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        min-width: 330px;
      }
      .counts {
        display: grid;
        gap: 4px;
        color: #334155;
        white-space: nowrap;
      }
      .error {
        color: var(--red);
        font-size: 13px;
      }
      .empty {
        padding: 30px;
        color: var(--muted);
        text-align: center;
      }
      .roles {
        margin-top: 16px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      .role-note {
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        padding: 12px;
        font-size: 13px;
        color: #334155;
      }
      .role-note strong {
        display: block;
        color: var(--text);
        margin-bottom: 4px;
      }
      @media (max-width: 1020px) {
        .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        table, thead, tbody, th, td, tr { display: block; }
        thead { display: none; }
        tr { border-bottom: 1px solid var(--line); }
        td { border-bottom: 0; padding: 9px 12px; }
        td::before {
          content: attr(data-label);
          display: block;
          color: var(--muted);
          font-size: 11px;
          text-transform: uppercase;
          margin-bottom: 3px;
        }
        .actions { min-width: 0; }
        .roles { grid-template-columns: 1fr; }
        .client-form { grid-template-columns: 1fr; }
        .span-2, .span-4 { grid-column: 1; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Lucy3000 Panel interno</h1>
          <p class="subtitle" id="configPath">Cargando configuracion...</p>
        </div>
        <div class="toolbar">
          <button class="btn-secondary" id="tokenButton" type="button" hidden>Token</button>
          <button class="btn-secondary" id="refreshButton" type="button">Actualizar</button>
        </div>
      </header>

      <section class="metrics" id="metrics"></section>

      <section class="form-panel">
        <p class="form-title">Nuevo cliente Supabase</p>
        <form class="client-form" id="clientForm">
          <label>
            Centro
            <input name="businessName" autocomplete="organization" required placeholder="Nombre del centro" />
          </label>
          <label>
            Contacto
            <input name="contactName" autocomplete="name" placeholder="Persona de contacto" />
          </label>
          <label>
            Telefono
            <input name="phone" autocomplete="tel" placeholder="+34..." />
          </label>
          <label>
            Email
            <input name="contactEmail" autocomplete="email" placeholder="email@cliente.com" />
          </label>
          <label class="span-2">
            Direccion
            <input name="address" autocomplete="street-address" placeholder="Direccion del centro" />
          </label>
          <label class="span-2">
            URL Supabase
            <input name="supabaseUrl" inputmode="url" placeholder="https://PROJECT_REF.supabase.co" />
          </label>
          <label class="span-2">
            URL Dashboard Supabase
            <input name="dashboardUrl" inputmode="url" placeholder="https://supabase.com/dashboard/project/PROJECT_REF" />
          </label>
          <label class="span-2">
            URL Pooler
            <input name="databaseUrl" inputmode="url" placeholder="postgresql://postgres.PROJECT_REF:password@...pooler.supabase.com:5432/postgres" />
          </label>
          <label class="span-4">
            Notas
            <textarea name="notes" placeholder="Contrato, instalacion, observaciones internas"></textarea>
          </label>
          <div class="form-actions span-4">
            <button class="btn-active" type="submit">Guardar cliente</button>
            <span class="form-status" id="formStatus"></span>
          </div>
        </form>
      </section>

      <section class="panel">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Contacto</th>
              <th>Estado</th>
              <th>Datos</th>
              <th>Supabase</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="clientRows"></tbody>
        </table>
        <div class="empty" id="emptyState" hidden></div>
      </section>

      <section class="roles" aria-label="Roles">
        <div class="role-note"><strong>ADMIN</strong>Gestion del centro: usuarios, ajustes, importaciones, SQL y reportes.</div>
        <div class="role-note"><strong>MANAGER</strong>Gestion diaria con mas permisos operativos, sin administracion completa.</div>
        <div class="role-note"><strong>EMPLOYEE</strong>Uso diario: citas, clientes, ventas y caja segun permisos actuales.</div>
      </section>
    </main>

    <script>
      const tokenEnabled = ${tokenEnabled ? 'true' : 'false'};
      const statusLabel = {
        PENDING: 'Pendiente',
        TRIAL: 'En prueba',
        ACTIVE: 'Activo',
        TRIAL_EXPIRED: 'Prueba caducada',
        BLOCKED: 'Bloqueado',
        CANCELLED: 'Cancelado',
        INACTIVE: 'Inactivo'
      };
      const actionLabel = {
        startTrial: 'Iniciar prueba',
        activate: 'Activar pago',
        block: 'Bloquear',
        cancel: 'Cancelar'
      };

      const rowsEl = document.getElementById('clientRows');
      const emptyEl = document.getElementById('emptyState');
      const metricsEl = document.getElementById('metrics');
      const configPathEl = document.getElementById('configPath');
      const refreshButton = document.getElementById('refreshButton');
      const tokenButton = document.getElementById('tokenButton');
      const clientForm = document.getElementById('clientForm');
      const formStatus = document.getElementById('formStatus');

      if (tokenEnabled) {
        tokenButton.hidden = false;
      }

      function getToken() {
        return localStorage.getItem('lucy-admin-token') || '';
      }

      function authHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = getToken();
        if (token) headers['x-lucy-admin-token'] = token;
        return headers;
      }

      function maybeAskToken() {
        if (!tokenEnabled) return false;
        const token = window.prompt('Token del panel interno');
        if (!token) return false;
        localStorage.setItem('lucy-admin-token', token);
        return true;
      }

      tokenButton.addEventListener('click', () => {
        localStorage.removeItem('lucy-admin-token');
        maybeAskToken();
        load();
      });

      refreshButton.addEventListener('click', () => load());

      clientForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        formStatus.textContent = 'Guardando...';
        const formData = new FormData(clientForm);
        const payload = Object.fromEntries(formData.entries());

        try {
          await requestJson('/api/client-config', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          clientForm.reset();
          formStatus.textContent = 'Cliente guardado';
          await load();
        } catch (error) {
          formStatus.textContent = error.message || 'No se pudo guardar';
        }
      });

      function formatDate(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
      }

      function setText(parent, selector, value) {
        const el = parent.querySelector(selector);
        if (el) el.textContent = value || '';
      }

      function renderMetric(label, value) {
        const item = document.createElement('div');
        item.className = 'metric';
        item.innerHTML = '<span></span><strong></strong>';
        setText(item, 'span', label);
        setText(item, 'strong', String(value ?? 0));
        return item;
      }

      function renderMetrics(totals) {
        metricsEl.replaceChildren(
          renderMetric('Configurados', totals.configured),
          renderMetric('Conectados', totals.connected),
          renderMetric('Pendientes', totals.pending),
          renderMetric('En prueba', totals.trial),
          renderMetric('Activos', totals.active),
          renderMetric('Bloqueados', totals.blocked + totals.cancelled + totals.expired)
        );
      }

      function renderClients(data) {
        rowsEl.replaceChildren();
        const clients = data.clients || [];
        configPathEl.textContent = data.configPath || '';
        renderMetrics(data.totals || {});

        if (data.missingConfig) {
          emptyEl.hidden = false;
          emptyEl.textContent = 'Falta clients.local.json. Copia clients.example.json y rellena tus clientes.';
          return;
        }

        if (clients.length === 0) {
          emptyEl.hidden = false;
          emptyEl.textContent = 'No hay clientes configurados todavia.';
          return;
        }

        emptyEl.hidden = true;

        for (const client of clients) {
          if (!client.connected || client.tenants.length === 0) {
            rowsEl.appendChild(renderClientRow(client, null));
            continue;
          }

          for (const tenant of client.tenants) {
            rowsEl.appendChild(renderClientRow(client, tenant));
          }
        }
      }

      function renderClientRow(client, tenant) {
        const row = document.createElement('tr');
        const license = tenant?.license;
        const status = license?.status || (client.connected ? 'INACTIVE' : 'BLOCKED');
        const admins = tenant?.admins || [];
        const mainAdmin = admins[0];
        row.innerHTML = [
          '<td data-label="Cliente"><div class="name"></div><div class="muted tenant"></div><div class="muted notes"></div></td>',
          '<td data-label="Contacto"><div class="contact"></div><div class="muted phone"></div><div class="muted address"></div></td>',
          '<td data-label="Estado"><span class="pill"></span><div class="muted dates"></div><div class="error"></div></td>',
          '<td data-label="Datos"><div class="counts"></div></td>',
          '<td data-label="Supabase"><div class="links"></div></td>',
          '<td data-label="Acciones"><div class="actions"></div></td>'
        ].join('');

        setText(row, '.name', client.businessName || client.label);
        setText(row, '.tenant', tenant ? 'Tenant: ' + tenant.name + ' / ' + tenant.slug : 'Tenant no disponible');
        setText(row, '.notes', client.notes || '');
        setText(row, '.contact', client.contactName || mainAdmin?.name || '-');
        setText(row, '.phone', [client.phone, client.contactEmail || mainAdmin?.email].filter(Boolean).join(' / '));
        setText(row, '.address', client.address || '-');

        const pill = row.querySelector('.pill');
        pill.className = 'pill status-' + status;
        pill.textContent = statusLabel[status] || status;

        const dateParts = [];
        if (license?.trialEndsAt) dateParts.push('Prueba: ' + formatDate(license.trialEndsAt));
        if (license?.activatedAt) dateParts.push('Activado: ' + formatDate(license.activatedAt));
        if (tenant?.serverNow) dateParts.push('Servidor: ' + formatDate(tenant.serverNow));
        setText(row, '.dates', dateParts.join(' / '));
        setText(row, '.error', client.connected ? '' : client.error);

        const counts = row.querySelector('.counts');
        counts.replaceChildren(
          textLine('Clientes app: ' + (tenant?.counts?.clients ?? '-')),
          textLine('Citas: ' + (tenant?.counts?.appointments ?? '-')),
          textLine('Ventas: ' + (tenant?.counts?.sales ?? '-')),
          textLine('Usuarios: ' + (tenant?.users?.length ?? '-'))
        );

        const links = row.querySelector('.links');
        if (client.dashboardUrl) {
          links.appendChild(linkButton('Abrir Supabase', client.dashboardUrl));
        } else if (client.supabaseUrl) {
          links.appendChild(linkButton('URL proyecto', client.supabaseUrl));
        } else {
          links.appendChild(textLine('-'));
        }

        const actions = row.querySelector('.actions');
        if (tenant && client.connected) {
          if (status !== 'ACTIVE' && status !== 'TRIAL') {
            actions.appendChild(actionButton('startTrial', client.id, tenant.id));
          }
          if (status !== 'ACTIVE') {
            actions.appendChild(actionButton('activate', client.id, tenant.id));
          }
          if (status !== 'BLOCKED' && status !== 'CANCELLED') {
            actions.appendChild(actionButton('block', client.id, tenant.id));
          }
          if (status !== 'CANCELLED') {
            actions.appendChild(actionButton('cancel', client.id, tenant.id));
          }
        } else {
          actions.appendChild(textLine('Sin acciones disponibles'));
        }

        return row;
      }

      function textLine(text) {
        const el = document.createElement('div');
        el.textContent = text;
        return el;
      }

      function linkButton(text, href) {
        const link = document.createElement('a');
        link.className = 'link-button btn-link';
        link.textContent = text;
        link.href = href;
        link.target = '_blank';
        link.rel = 'noreferrer';
        return link;
      }

      function actionButton(action, clientId, tenantId) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = actionLabel[action];
        button.className =
          action === 'startTrial'
            ? 'btn-trial'
            : action === 'activate'
              ? 'btn-active'
              : action === 'block'
                ? 'btn-block'
                : 'btn-cancel';
        button.addEventListener('click', () => runAction(action, clientId, tenantId));
        return button;
      }

      async function requestJson(url, options = {}) {
        const response = await fetch(url, {
          ...options,
          headers: {
            ...authHeaders(),
            ...(options.headers || {})
          }
        });
        if (response.status === 401 && maybeAskToken()) {
          return requestJson(url, options);
        }
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error || 'Error de panel');
        }
        return body;
      }

      async function load() {
        refreshButton.disabled = true;
        try {
          const data = await requestJson('/api/clients');
          renderClients(data);
        } catch (error) {
          emptyEl.hidden = false;
          emptyEl.textContent = error.message || 'No se pudo cargar el panel.';
        } finally {
          refreshButton.disabled = false;
        }
      }

      async function runAction(action, clientId, tenantId) {
        const label = actionLabel[action];
        if (!window.confirm(label + ' para este cliente?')) return;
        try {
          await requestJson('/api/license-action', {
            method: 'POST',
            body: JSON.stringify({ action, clientId, tenantId })
          });
          await load();
        } catch (error) {
          window.alert(error.message || 'No se pudo aplicar la accion.');
        }
      }

      load();
    </script>
  </body>
</html>`
}
