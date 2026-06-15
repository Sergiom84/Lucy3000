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

  it('sends the trial request through Resend when configured', async () => {
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
      ownerEmailId: 'email-1',
      recipient: 'ventas@lucy3000.test',
      requesterEmailId: 'email-1',
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
      subject: 'Solicitud información Lucy3000 - Centro Demo',
      text: expect.stringContaining('10 días'),
      html: expect.stringContaining('versión')
    })
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      from: 'Lucy3000 <hola@lucy3000.test>',
      to: ['demo@example.com'],
      reply_to: 'ventas@lucy3000.test',
      subject: 'Solicitud de prueba - Lucy3000',
      text: expect.stringContaining('Teléfono'),
      html: expect.stringContaining('interés')
    })
  })

  it('waits for the requester copy before returning the delivered request', async () => {
    process.env.RESEND_API_KEY = 'resend-test-key'
    process.env.TRIAL_REQUEST_TO = 'ventas@lucy3000.test'
    process.env.TRIAL_REQUEST_FROM = 'Lucy3000 <hola@lucy3000.test>'

    let resolveRequesterCopy: (value: Response) => void = () => {}
    const requesterCopy = new Promise<Response>((resolve) => {
      resolveRequesterCopy = resolve
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'owner-email-1' })
      } as Response)
      .mockReturnValueOnce(requesterCopy)

    const resultPromise = sendTrialRequestEmail({
      email: 'demo@example.com',
      name: 'Centro Demo'
    })

    let settled = false
    resultPromise.then(() => {
      settled = true
    })

    await Promise.resolve()
    expect(settled).toBe(false)

    resolveRequesterCopy({
      ok: true,
      status: 200,
      json: async () => ({ id: 'requester-copy-1' })
    } as Response)

    const result = await resultPromise
    expect(result).toEqual({
      copiedToRequester: true,
      delivered: true,
      ownerEmailId: 'owner-email-1',
      recipient: 'ventas@lucy3000.test',
      requesterEmailId: 'requester-copy-1',
      requesterEmail: 'demo@example.com'
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
