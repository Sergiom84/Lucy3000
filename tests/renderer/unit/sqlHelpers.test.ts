import { describe, expect, it } from 'vitest'
import {
  buildSelectedSummary,
  buildUserOptions,
  getVisibleWarnings,
  normalizeOptionalText,
  parseNullableNumber,
  suggestUserId
} from '../../../src/renderer/features/sql/helpers'
import type { LucyUser, SqlAnalysisResult, SqlAppointmentPreview } from '../../../src/renderer/features/sql/types'

const baseAppointment = (overrides: Partial<SqlAppointmentPreview> = {}): SqlAppointmentPreview => ({
  id: 'appointment-1',
  selected: true,
  issues: [],
  legacyId: 'legacy-1',
  legacyClientNumber: 'C-1',
  clientName: 'Ana',
  phone: null,
  serviceCode: null,
  serviceName: null,
  date: '2026-04-23',
  startTime: '10:00',
  endTime: null,
  durationMinutes: null,
  cabin: null,
  legacyProfessionalCode: null,
  legacyProfessionalName: null,
  secondaryProfessionalCode: null,
  status: null,
  notes: null,
  legacyPackNumber: null,
  ...overrides
})

describe('sql helpers', () => {
  it('normalizes optional values and parses nullable numbers', () => {
    expect(normalizeOptionalText('  ejemplo  ')).toBe('ejemplo')
    expect(normalizeOptionalText('   ')).toBeNull()
    expect(parseNullableNumber('12,50')).toBe(12.5)
    expect(parseNullableNumber('')).toBeNull()
  })

  it('builds user options and suggests a Lucy user from legacy professional data', () => {
    const users: LucyUser[] = [
      {
        id: 'user-1',
        name: 'Marta Ruiz',
        email: 'mruiz@example.com',
        username: 'mruiz',
        isActive: true
      },
      {
        id: 'user-2',
        name: 'Luis',
        email: 'luis@example.com',
        username: null,
        isActive: false
      }
    ]

    expect(buildUserOptions(users)).toEqual([
      { value: 'user-1', label: 'Marta Ruiz (mruiz)' },
      { value: 'user-2', label: 'Luis [inactivo]' }
    ])

    expect(
      suggestUserId(
        baseAppointment({
          legacyProfessionalName: 'Marta Ruiz'
        }),
        users
      )
    ).toBe('user-1')

    expect(
      suggestUserId(
        baseAppointment({
          legacyProfessionalCode: 'mruiz'
        }),
        users
      )
    ).toBe('user-1')
  })

  it('computes selected summary and filters warnings by step', () => {
    const analysis = {
      warnings: [
        { code: 'file-1', message: 'Archivo parcial', severity: 'warning', step: 'file' },
        { code: 'bono-1', message: 'Bono legacy', severity: 'info', step: 'bonos' }
      ],
      clients: [{ id: 'client-1', selected: true, issues: ['a'] }, { id: 'client-2', selected: false, issues: [] }],
      services: [{ id: 'service-1', selected: true, issues: [] }],
      products: [{ id: 'product-1', selected: false, issues: [] }],
      bonoTemplates: [{ id: 'bono-template-1', selected: true, issues: [] }],
      clientBonos: [{ id: 'client-bono-1', selected: false, issues: [] }],
      accountBalances: [{ id: 'balance-1', selected: true, issues: [] }],
      appointments: [
        baseAppointment({
          id: 'appointment-1',
          selected: true,
          legacyProfessionalCode: 'legacy-code',
          targetUserId: null
        }),
        baseAppointment({
          id: 'appointment-2',
          selected: true,
          legacyProfessionalCode: null,
          targetUserId: null
        })
      ],
      agendaBlocks: [{ id: 'block-1', selected: true, issues: [] }],
      agendaNotes: [{ id: 'note-1', selected: false, issues: [] }],
      consents: [{ id: 'consent-1', selected: true, issues: [] }],
      signatures: [{ id: 'signature-1', selected: false, issues: [] }]
    } as unknown as SqlAnalysisResult

    expect(buildSelectedSummary(analysis)).toEqual({
      clients: 1,
      services: 1,
      products: 0,
      bonoTemplates: 1,
      clientBonos: 0,
      accountBalances: 1,
      appointments: 2,
      agendaBlocks: 1,
      agendaNotes: 0,
      consents: 1,
      signatures: 0,
      pendingUserMappings: 1
    })

    expect(getVisibleWarnings(analysis, 'bonoTemplates')).toEqual([analysis.warnings[1]])
    expect(getVisibleWarnings(analysis, 'summary')).toEqual(analysis.warnings)
  })
})
