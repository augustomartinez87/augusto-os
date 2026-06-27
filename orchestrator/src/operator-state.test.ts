import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { getOperatorState } from './operator-state.js'

let tmpDir: string
let yamlPath: string

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'op-state-test-'))
  yamlPath = path.join(tmpDir, 'OPERATOR_STATE.yaml')
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true })
})

describe('getOperatorState', () => {
  it('returns PRODUCT/normal/true when file does not exist', () => {
    const state = getOperatorState('/nonexistent/path/OPERATOR_STATE.yaml')
    expect(state.mode).toBe('PRODUCT')
    expect(state.responseStyle).toBe('normal')
    expect(state.availableForQuestions).toBe(true)
  })

  it('reads PRODUCT mode with normal style', () => {
    writeFileSync(yamlPath, 'mode: PRODUCT\nresponse_style: normal\navailable_for_questions: true\n')
    const state = getOperatorState(yamlPath)
    expect(state.mode).toBe('PRODUCT')
    expect(state.responseStyle).toBe('normal')
    expect(state.availableForQuestions).toBe(true)
  })

  it('reads OFFICE mode with short style', () => {
    writeFileSync(yamlPath, 'mode: OFFICE\nresponse_style: short\navailable_for_questions: true\n')
    const state = getOperatorState(yamlPath)
    expect(state.mode).toBe('OFFICE')
    expect(state.responseStyle).toBe('short')
  })

  it('reads SLEEP mode', () => {
    writeFileSync(yamlPath, 'mode: SLEEP\nresponse_style: normal\navailable_for_questions: false\n')
    const state = getOperatorState(yamlPath)
    expect(state.mode).toBe('SLEEP')
    expect(state.availableForQuestions).toBe(false)
  })

  it('defaults mode to PRODUCT when field is missing', () => {
    writeFileSync(yamlPath, 'response_style: short\n')
    const state = getOperatorState(yamlPath)
    expect(state.mode).toBe('PRODUCT')
    expect(state.responseStyle).toBe('short')
  })

  it('defaults response_style to normal when field is missing', () => {
    writeFileSync(yamlPath, 'mode: SLEEP\n')
    const state = getOperatorState(yamlPath)
    expect(state.mode).toBe('SLEEP')
    expect(state.responseStyle).toBe('normal')
  })

  it('defaults available_for_questions to true when field is missing', () => {
    writeFileSync(yamlPath, 'mode: OFFICE\nresponse_style: short\n')
    const state = getOperatorState(yamlPath)
    expect(state.availableForQuestions).toBe(true)
  })

  it('defaults mode to PRODUCT for unrecognized mode value', () => {
    writeFileSync(yamlPath, 'mode: UNKNOWN\n')
    const state = getOperatorState(yamlPath)
    expect(state.mode).toBe('PRODUCT')
  })

  it('defaults response_style to normal for unrecognized style value', () => {
    writeFileSync(yamlPath, 'mode: OFFICE\nresponse_style: verbose\n')
    const state = getOperatorState(yamlPath)
    expect(state.responseStyle).toBe('normal')
  })

  it('handles empty YAML file without throwing', () => {
    writeFileSync(yamlPath, '')
    const state = getOperatorState(yamlPath)
    expect(state.mode).toBe('PRODUCT')
    expect(state.responseStyle).toBe('normal')
    expect(state.availableForQuestions).toBe(true)
  })
})
