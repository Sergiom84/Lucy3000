import { describe, expect, it } from 'vitest'
import {
  getAppointmentBonoCandidates,
  getConsumedAppointmentBono,
  getRemainingBonoSessions
} from '../../../src/renderer/utils/appointmentBonos'

describe('appointmentBonos', () => {
  const appointment = {
    id: 'appointment-1',
    serviceId: 'service-1',
    service: {
      id: 'service-1',
      name: 'Rollaction'
    },
    appointmentServices: [
      {
        serviceId: 'service-1',
        sortOrder: 0,
        service: {
          id: 'service-1',
          name: 'Rollaction'
        }
      }
    ]
  }

  it('counts remaining sessions with lightweight bono summaries', () => {
    expect(
      getRemainingBonoSessions({
        sessions: [{ status: 'AVAILABLE' }, { status: 'CONSUMED' }, { status: 'AVAILABLE' }]
      } as any)
    ).toBe(2)
  })

  it('detects a consumed bono session linked to the appointment', () => {
    const consumedBono = getConsumedAppointmentBono(appointment, [
      {
        id: 'bono-pack-1',
        name: 'Rollaction 20 sesiones',
        status: 'ACTIVE',
        service: { id: 'service-1', name: 'Rollaction' },
        sessions: [
          {
            id: 'session-1',
            sessionNumber: 8,
            status: 'CONSUMED',
            appointmentId: 'appointment-1',
            consumedAt: '2026-04-20T17:00:00.000Z'
          }
        ]
      }
    ])

    expect(consumedBono).toEqual({
      id: 'bono-pack-1',
      name: 'Rollaction 20 sesiones',
      sessionNumber: 8,
      sessionNumbers: [8],
      consumedAt: '2026-04-20T17:00:00.000Z',
      consumedCount: 1
    })
  })

  it('prioritizes reserved and compatible bonos for the appointment', () => {
    const candidates = getAppointmentBonoCandidates(appointment, [
      {
        id: 'bono-pack-2',
        name: 'Genérico',
        status: 'ACTIVE',
        service: null,
        sessions: [{ id: 'session-2', sessionNumber: 4, status: 'AVAILABLE', appointmentId: null }]
      },
      {
        id: 'bono-pack-1',
        name: 'Rollaction 20 sesiones',
        status: 'ACTIVE',
        service: { id: 'service-1', name: 'Rollaction' },
        sessions: [
          { id: 'session-1', sessionNumber: 8, status: 'AVAILABLE', appointmentId: 'appointment-1' }
        ]
      }
    ])

    expect(candidates).toEqual([
      {
        id: 'bono-pack-1',
        name: 'Rollaction 20 sesiones',
        remainingSessions: 1,
        chargeableSessions: 1,
        serviceName: 'Rollaction',
        isReservedForAppointment: true,
        reservedSessionNumber: 8
      }
    ])
  })

  it('treats the same treatment family with different minutes as compatible', () => {
    const candidates = getAppointmentBonoCandidates(
      {
        id: 'appointment-2',
        serviceId: 'service-20',
        service: {
          id: 'service-20',
          name: 'Dep. electrica 20 min'
        },
        appointmentServices: [
          {
            serviceId: 'service-20',
            sortOrder: 0,
            service: {
              id: 'service-20',
              name: 'Dep. electrica 20 min'
            }
          }
        ]
      },
      [
        {
          id: 'bono-pack-3',
          name: 'Dep. electrica 60 min · 12 sesiones',
          status: 'ACTIVE',
          service: { id: 'service-60', name: 'Dep. electrica 60 min' },
          sessions: [{ id: 'session-3', sessionNumber: 2, status: 'AVAILABLE', appointmentId: null }]
        }
      ]
    )

    expect(candidates).toEqual([
      {
        id: 'bono-pack-3',
        name: 'Dep. electrica 60 min · 12 sesiones',
        remainingSessions: 1,
        chargeableSessions: 1,
        serviceName: 'Dep. electrica 60 min',
        isReservedForAppointment: false,
        reservedSessionNumber: null
      }
    ])
  })

  it('uses the linked bono template as canonical source when the pack has no service attached', () => {
    const candidates = getAppointmentBonoCandidates(
      {
        id: 'appointment-antiacne-1',
        serviceId: 'service-antiacne',
        service: {
          id: 'service-antiacne',
          name: 'Antiacne',
          category: 'Facial',
          serviceCode: 'ANTI'
        },
        appointmentServices: [
          {
            serviceId: 'service-antiacne',
            sortOrder: 0,
            service: {
              id: 'service-antiacne',
              name: 'Antiacne',
              category: 'Facial',
              serviceCode: 'ANTI'
            }
          }
        ]
      },
      [
        {
          id: 'bono-pack-antiacne',
          name: 'Bono de 6 sesiones',
          bonoTemplateId: 'template-antiacne-6',
          status: 'ACTIVE',
          service: null,
          sessions: [
            { id: 'session-antiacne', sessionNumber: 2, status: 'AVAILABLE', appointmentId: null }
          ]
        }
      ],
      {
        bonoTemplates: [
          {
            id: 'template-antiacne-6',
            category: 'Facial',
            description: 'Bono de 6 sesiones',
            serviceId: 'service-antiacne',
            serviceName: 'Antiacne',
            serviceLookup: 'ANTI',
            totalSessions: 6,
            price: 199,
            isActive: true,
            createdAt: '2026-04-21T00:00:00.000Z'
          }
        ]
      }
    )

    expect(candidates).toEqual([
      {
        id: 'bono-pack-antiacne',
        name: 'Bono de 6 sesiones',
        remainingSessions: 1,
        chargeableSessions: 1,
        serviceName: 'Antiacne',
        isReservedForAppointment: false,
        reservedSessionNumber: null
      }
    ])
  })

  it('requires all appointment services to be compatible before offering charge with bono', () => {
    const candidates = getAppointmentBonoCandidates(
      {
        id: 'appointment-mixed-1',
        serviceId: 'service-rollaction',
        service: {
          id: 'service-rollaction',
          name: 'Rollaction',
          category: 'Corporal',
          serviceCode: 'ROLL'
        },
        appointmentServices: [
          {
            serviceId: 'service-rollaction',
            sortOrder: 0,
            service: {
              id: 'service-rollaction',
              name: 'Rollaction',
              category: 'Corporal',
              serviceCode: 'ROLL'
            }
          },
          {
            serviceId: 'service-antiacne',
            sortOrder: 1,
            service: {
              id: 'service-antiacne',
              name: 'Antiacne',
              category: 'Facial',
              serviceCode: 'ANTI'
            }
          }
        ]
      },
      [
        {
          id: 'bono-pack-rollaction',
          name: 'Rollaction · 20 sesiones',
          status: 'ACTIVE',
          service: {
            id: 'service-rollaction',
            name: 'Rollaction',
            category: 'Corporal',
            serviceCode: 'ROLL'
          },
          sessions: [{ id: 'session-rollaction', sessionNumber: 4, status: 'AVAILABLE', appointmentId: null }]
        }
      ]
    )

    expect(candidates).toEqual([])
  })
})
