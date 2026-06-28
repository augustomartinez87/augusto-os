import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { writeBotHeartbeat, isBotAlive, BOT_HB_STALE_MS } from './bot-heartbeat.js'

describe('bot-heartbeat', () => {
  let tmpDir: string
  let hbPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'bot-hb-test-'))
    hbPath = path.join(tmpDir, 'BOT_HEARTBEAT.json')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true })
  })

  // ── writeBotHeartbeat ──────────────────────────────────────────────────────────

  it('creates the file with pid and lastHeartbeat', () => {
    writeBotHeartbeat(hbPath)
    expect(existsSync(hbPath)).toBe(true)
    const raw = JSON.parse(readFileSync(hbPath, 'utf-8'))
    expect(raw.pid).toBe(process.pid)
    expect(typeof raw.lastHeartbeat).toBe('string')
    expect(new Date(raw.lastHeartbeat).getTime()).toBeGreaterThan(0)
  })

  it('overwrites an existing heartbeat without throwing', () => {
    writeBotHeartbeat(hbPath)
    writeBotHeartbeat(hbPath)
    expect(existsSync(hbPath)).toBe(true)
  })

  // ── isBotAlive ─────────────────────────────────────────────────────────────────

  it('returns false when file does not exist', () => {
    expect(isBotAlive(hbPath)).toBe(false)
  })

  it('returns true when heartbeat is fresh', () => {
    writeBotHeartbeat(hbPath)
    expect(isBotAlive(hbPath)).toBe(true)
  })

  it('returns false when heartbeat is stale (older than threshold)', () => {
    const staleTs = new Date(Date.now() - BOT_HB_STALE_MS - 1000).toISOString()
    writeFileSync(hbPath, JSON.stringify({ pid: 9999, lastHeartbeat: staleTs }), 'utf-8')
    expect(isBotAlive(hbPath)).toBe(false)
  })

  it('returns false when file is malformed JSON', () => {
    writeFileSync(hbPath, 'not-json', 'utf-8')
    expect(isBotAlive(hbPath)).toBe(false)
  })

  it('returns false when lastHeartbeat field is missing', () => {
    writeFileSync(hbPath, JSON.stringify({ pid: 9999 }), 'utf-8')
    expect(isBotAlive(hbPath)).toBe(false)
  })

  // ── interacción bot + loop (caso S-029) ────────────────────────────────────────

  it('bot alive → isBotAlive true; bot dead (stale) → isBotAlive false', () => {
    // Simula bot arrancando
    writeBotHeartbeat(hbPath)
    expect(isBotAlive(hbPath)).toBe(true)

    // Simula bot caído: heartbeat queda stale
    const deadTs = new Date(Date.now() - BOT_HB_STALE_MS - 5000).toISOString()
    writeFileSync(hbPath, JSON.stringify({ pid: 9999, lastHeartbeat: deadTs }), 'utf-8')
    expect(isBotAlive(hbPath)).toBe(false)
  })
})
