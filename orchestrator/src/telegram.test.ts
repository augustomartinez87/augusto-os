import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { OperatorState } from './operator-state.js'
import { notifyGate, notifyDeployed, notifyReleaseFailed, pollApprovalOnce } from './telegram.js'
import { loadState, saveState } from './state.js'

// log is a side-effect; suppress in tests
vi.mock('./limits.js', () => ({ log: vi.fn(), sleepUntil: vi.fn() }))
vi.mock('./state.js', () => ({ loadState: vi.fn().mockReturnValue(null), saveState: vi.fn() }))
vi.mock('fs', () => ({ appendFileSync: vi.fn() }))

// ── helpers ────────────────────────────────────────────────────────────────────

function makeState(mode: OperatorState['mode'], style: OperatorState['responseStyle'] = 'normal'): OperatorState {
  return { mode, responseStyle: style, availableForQuestions: true }
}

function makeSend() {
  return vi.fn().mockResolvedValue({ ok: true })
}

const CHAT_ID = '99999'

// ── notifyGate ─────────────────────────────────────────────────────────────────

describe('notifyGate', () => {
  it('SLEEP: does not call send for any attempt', async () => {
    const send = makeSend()
    await notifyGate('Step 1: deploy', 'F-0001', {
      getState: () => makeState('SLEEP'),
      send,
      chatId: CHAT_ID,
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('PRODUCT: sends full message with inline_keyboard', async () => {
    const send = makeSend()
    const detail = 'Step 1: hacer deploy\nLínea 2 de detalle'
    await notifyGate(detail, 'F-0002', {
      getState: () => makeState('PRODUCT'),
      send,
      chatId: CHAT_ID,
    })
    expect(send).toHaveBeenCalledOnce()
    const [method, body] = send.mock.calls[0] as [string, Record<string, unknown>]
    expect(method).toBe('sendMessage')
    expect(body.chat_id).toBe(CHAT_ID)
    expect(body.text).toContain('Step 1: hacer deploy')
    expect(body.text).toContain('Línea 2 de detalle')
    expect(body.text).toContain('F-0002')
    // inline_keyboard presente
    const kb = (body.reply_markup as any).inline_keyboard
    expect(kb[0]).toHaveLength(2)
    expect(kb[0][0].callback_data).toBe('approve:F-0002')
    expect(kb[0][1].callback_data).toBe('reject:F-0002')
  })

  it('OFFICE + short: sends only first line of detail but keeps inline_keyboard', async () => {
    const send = makeSend()
    const detail = 'Step 1: hacer deploy\nLínea 2 que no debe aparecer'
    await notifyGate(detail, 'F-0003', {
      getState: () => makeState('OFFICE', 'short'),
      send,
      chatId: CHAT_ID,
    })
    expect(send).toHaveBeenCalledOnce()
    const [, body] = send.mock.calls[0] as [string, Record<string, unknown>]
    expect(body.text).toContain('F-0003')
    expect(body.text).toContain('Step 1: hacer deploy')
    expect(body.text).not.toContain('Línea 2 que no debe aparecer')
    // inline_keyboard sigue presente en modo OFFICE
    const kb = (body.reply_markup as any).inline_keyboard
    expect(kb[0][0].callback_data).toBe('approve:F-0003')
    expect(kb[0][1].callback_data).toBe('reject:F-0003')
  })

  it('OFFICE + normal style: sends full message (no truncation)', async () => {
    const send = makeSend()
    const detail = 'Step 1: deploy\nLínea 2 del detalle'
    await notifyGate(detail, 'F-0004', {
      getState: () => makeState('OFFICE', 'normal'),
      send,
      chatId: CHAT_ID,
    })
    const [, body] = send.mock.calls[0] as [string, Record<string, unknown>]
    expect(body.text).toContain('Línea 2 del detalle')
  })
})

// ── notifyDeployed ─────────────────────────────────────────────────────────────

describe('notifyDeployed', () => {
  it('SLEEP: does not call send', async () => {
    const send = makeSend()
    await notifyDeployed('F-0001', undefined, {
      getState: () => makeState('SLEEP'),
      send,
      chatId: CHAT_ID,
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('PRODUCT: sends full message including tnaNote', async () => {
    const send = makeSend()
    await notifyDeployed('F-0002', 'Nota TNA importante', {
      getState: () => makeState('PRODUCT'),
      send,
      chatId: CHAT_ID,
    })
    expect(send).toHaveBeenCalledOnce()
    const [, body] = send.mock.calls[0] as [string, Record<string, unknown>]
    expect(body.text).toContain('F-0002 deployado a prod')
    expect(body.text).toContain('Nota TNA importante')
  })

  it('OFFICE + short: sends one-line compact message without tnaNote', async () => {
    const send = makeSend()
    await notifyDeployed('F-0003', 'Nota TNA que no debe aparecer', {
      getState: () => makeState('OFFICE', 'short'),
      send,
      chatId: CHAT_ID,
    })
    const [, body] = send.mock.calls[0] as [string, Record<string, unknown>]
    expect(body.text).toContain('F-0003 deployado')
    expect(body.text).not.toContain('Nota TNA que no debe aparecer')
    expect(body.text).not.toContain('typecheck')
  })
})

// ── notifyReleaseFailed ────────────────────────────────────────────────────────

describe('notifyReleaseFailed', () => {
  it('SLEEP: does not call send', async () => {
    const send = makeSend()
    await notifyReleaseFailed('F-0001', 'tsc: error TS2345', {
      getState: () => makeState('SLEEP'),
      send,
      chatId: CHAT_ID,
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('PRODUCT: sends full message including error detail', async () => {
    const send = makeSend()
    await notifyReleaseFailed('F-0002', 'tsc: error TS2345 en foo.ts', {
      getState: () => makeState('PRODUCT'),
      send,
      chatId: CHAT_ID,
    })
    expect(send).toHaveBeenCalledOnce()
    const [, body] = send.mock.calls[0] as [string, Record<string, unknown>]
    expect(body.text).toContain('F-0002 NO se deployó')
    expect(body.text).toContain('tsc: error TS2345 en foo.ts')
    expect(body.text).toContain('Revisalo conmigo')
  })

  it('OFFICE + short: sends one-line compact message without error detail', async () => {
    const send = makeSend()
    await notifyReleaseFailed('F-0003', 'tsc: error TS2345 que no debe aparecer', {
      getState: () => makeState('OFFICE', 'short'),
      send,
      chatId: CHAT_ID,
    })
    const [, body] = send.mock.calls[0] as [string, Record<string, unknown>]
    expect(body.text).toContain('F-0003 NO se deployó')
    expect(body.text).not.toContain('tsc: error TS2345 que no debe aparecer')
    expect(body.text).not.toContain('Revisalo conmigo')
  })
})

// ── pollApprovalOnce ───────────────────────────────────────────────────────────

function makeActiveState(featureId = 'F-0042') {
  return {
    featureId,
    needsHumanApproval: `Step 1: deploy ${featureId}`,
    steps: [],
    branch: `feat/${featureId}`,
    merged: false,
    pushed: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    pausedUntil: null,
  } as any
}

describe('pollApprovalOnce', () => {
  beforeEach(() => {
    vi.mocked(loadState).mockReturnValue(null)
    vi.mocked(saveState).mockClear()
  })

  it('no-op when no API configured (no deps.send)', async () => {
    // Clear token so getApi() returns null — telegram.ts reads env lazily
    const savedToken = process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_BOT_TOKEN
    try {
      const result = await pollApprovalOnce(0)
      expect(result.newOffset).toBe(0)
    } finally {
      if (savedToken !== undefined) process.env.TELEGRAM_BOT_TOKEN = savedToken
    }
  })

  it('returns same offset when getUpdates returns empty result', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, result: [] })
    const result = await pollApprovalOnce(5, { send, chatId: CHAT_ID })
    expect(result.newOffset).toBe(5)
    expect(send).toHaveBeenCalledWith('getUpdates', { offset: 5, timeout: 5 })
  })

  it('approve: clears STATE.json and advances offset', async () => {
    vi.mocked(loadState).mockReturnValue(makeActiveState('F-0042'))
    const send = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        result: [{ update_id: 100, callback_query: { id: 'cq-1', from: { id: CHAT_ID }, data: 'approve:F-0042' } }],
      })
      .mockResolvedValue({ ok: true })

    const result = await pollApprovalOnce(0, { send, chatId: CHAT_ID })

    expect(result.newOffset).toBe(101)
    expect(saveState).toHaveBeenCalledWith(expect.objectContaining({ needsHumanApproval: null }))
    expect(send).toHaveBeenCalledWith('answerCallbackQuery', expect.objectContaining({ callback_query_id: 'cq-1' }))
    const lastCall = send.mock.calls.find(([m]: [string]) => m === 'sendMessage')
    expect(lastCall?.[1]?.text).toContain('Aprobado')
  })

  it('reject: logs to blocked.log, does not clear STATE.json', async () => {
    const { appendFileSync } = await import('fs')
    vi.mocked(loadState).mockReturnValue(makeActiveState('F-0042'))
    const send = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        result: [{ update_id: 200, callback_query: { id: 'cq-2', from: { id: CHAT_ID }, data: 'reject:F-0042' } }],
      })
      .mockResolvedValue({ ok: true })

    const result = await pollApprovalOnce(0, { send, chatId: CHAT_ID })

    expect(result.newOffset).toBe(201)
    expect(saveState).not.toHaveBeenCalled()
    expect(appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('blocked.log'),
      expect.stringContaining('F-0042'),
      'utf-8',
    )
  })

  it('ignores callback from unauthorized user', async () => {
    vi.mocked(loadState).mockReturnValue(makeActiveState('F-0042'))
    const send = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        result: [{ update_id: 300, callback_query: { id: 'cq-3', from: { id: '00000' }, data: 'approve:F-0042' } }],
      })
      .mockResolvedValue({ ok: true })

    const result = await pollApprovalOnce(0, { send, chatId: CHAT_ID })

    expect(result.newOffset).toBe(301)
    expect(saveState).not.toHaveBeenCalled()
  })

  it('handles getUpdates network failure gracefully', async () => {
    const send = vi.fn().mockRejectedValue(new Error('network error'))
    const result = await pollApprovalOnce(10, { send, chatId: CHAT_ID })
    expect(result.newOffset).toBe(10)
  })
})
