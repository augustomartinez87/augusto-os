export const MODEL_PLANNER = 'claude-opus-4-8'
export const MODEL_BUILDER = 'claude-sonnet-4-6'
export const MODEL_INTAKE = 'claude-haiku-4-5-20251001'
export const MODEL_ARCHITECT = 'claude-opus-4-8'
export const MODEL_REVIEWER = 'claude-opus-4-8'

// Minimum turns needed for a real LLM call: the model may emit tool_use on turn 1
// before producing final text output. --max-turns 1 cuts the loop at that point → exit 1.
export const MAX_TURNS = 15
