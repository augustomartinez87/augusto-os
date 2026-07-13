export const MODEL_PLANNER = 'claude-opus-4-8'
export const MODEL_BUILDER = 'claude-sonnet-4-6'
export const MODEL_INTAKE = 'claude-haiku-4-5-20251001'
export const MODEL_ARCHITECT = 'claude-opus-4-8'
export const MODEL_REVIEWER = 'claude-opus-4-8'
// Escalación de steps trabados (S-039): mismo tier que el planner (Opus) — ya
// falló 3 veces con MODEL_BUILDER (Sonnet), repetir con el mismo tier no aporta nada.
export const MODEL_FIXER = MODEL_PLANNER

// Minimum turns needed for a real LLM call: the model may emit tool_use on turn 1
// before producing final text output. --max-turns 1 cuts the loop at that point → exit 1.
export const MAX_TURNS = 15
