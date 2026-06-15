import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendTrialRequestEmail } from '../../../src/backend/services/trialRequestEmail.service'

describe('trial request email service', () => {
  afterEach(() => {
    delete process.env.RESEND_API_KEY
    delete process.env.TRIAL_REQUEST_TO
    delete process.env.TRIAL_REQUEST_FROM
    vi.restoreAllMocks()
  })

  it('returns not delivered when Resend is not configured', async () => {
    const result = await sendTrialRequestEmail({
      email: 'demo@example.com',
      name: 'Centro Demo'
    })

    expect(result).toEqual({
      copiedToRequester: false,
      delivered: false,
      recipient: 'sergiohernandezlara07@gmail.com',
      requesterEmail: 'demo@example.com'
    })
  })

  it('sends the trial request and requester copy through Resend when configured', async () => {
    process.env.RESEND_API_KEY = 'resend-test-key'
    process.env.TRIAL_REQUEST_TO = 'ventas@lucy3000.test'
    process.env.TRIAL_REQUEST_FROM = 'Lucy3000 <hola@lucy3000.test>'

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email-1' })
    } as Response)

    const result = await sendTrialRequestEmail({
      email: 'demo@example.com',
      name: 'Centro Demo'
    })

    expect(result).toEqual({
      copiedToRequester: true,
      delivered: true,
      recipient: 'ventas@lucy3000.test',
      requesterEmail: 'demo@example.com'
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer resend-test-key',
          'Content-Type': 'application/json'
        })
      })
    )
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      from: 'Lucy3000 <hola@lucy3000.test>',
      to: ['ventas@lucy3000.test'],
      reply_to: 'demo@example.com',
      subject: 'Solicitud informacion Lucy3000 - Centro Demo'
    })
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      from: 'Lucy3000 <hola@lucy3000.test>',
      to: ['demo@example.com'],
      reply_to: 'ventas@lucy3000.test',
      subject: 'Hemos recibido tu solicitud de informacion de Lucy3000'
    })
  })

  it('keeps the request delivered when only the requester copy fails', async () => {
    process.env.RESEND_API_KEY = 'resend-test-key'
    process.env.TRIAL_REQUEST_TO = 'ventas@lucy3000.test'
    process.env.TRIAL_REQUEST_FROM = 'Lucy3000 <hola@lucy3000.test>'

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'owner-email-1' })
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ message: 'Domain not verified' })
      } as Response)

    const result = await sendTrialRequestEmail({
      email: 'demo@example.com',
      name: 'Centro Demo'
    })

    expect(result).toEqual({
      copiedToRequester: false,
      delivered: true,
      recipient: 'ventas@lucy3000.test',
      requesterEmail: 'demo@example.com'
    })
  })
})
