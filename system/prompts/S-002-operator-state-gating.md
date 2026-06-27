Implementá S-002 (Fase 2 del gating por `OPERATOR_STATE`). Hoy `system/OPERATOR_STATE.yaml` define `mode: PRODUCT|OFFICE|SLEEP` y `response_style: normal|short`, pero solo se lee para loguear el modo al iniciar (`readSystemContext()` en `orchestrator/src/index.ts`, línea ~29) — el comentario del propio archivo YAML promete un comportamiento ("SLEEP: no bloquea, registra pendientes y sigue") que hoy NO existe. El scope real y acotado de esta fase: **las notificaciones de Telegram respetan el modo**, no se inventa nada más.

## Contexto (leé antes de tocar nada)
- `system/OPERATOR_STATE.yaml` — los 3 modos y `response_style`, con los comentarios de intención ya escritos ahí.
- `orchestrator/src/index.ts` función `readSystemContext()` (línea ~29) — hoy parsea el YAML inline con `parseYaml` solo para leer `mode` y loguearlo. Esa lógica se va a mover/reusar.
- `orchestrator/src/telegram.ts` — 3 funciones a gatear: `notifyGate` (línea 34, manda el mensaje con botones Aprobar/Rechazar — es la única vía de aprobación remota, así que su lógica de reintento NO se toca, solo si se manda o no), `notifyDeployed` (línea 78), `notifyReleaseFailed` (línea 83). Todas usan `tgSendRetry`/`tg` como wrapper de fetch nativo, no tocar esa capa.
- `orchestrator/src/gates.ts` — `setHumanGate()` llama a `notifyGate` fire-and-forget (`void notifyGate(...)`); no cambiar esa llamada, el cambio va DENTRO de `notifyGate`.

## Qué construir

### 1. `orchestrator/src/operator-state.ts` (nuevo, módulo compartido)
```ts
export type OperatorMode = 'PRODUCT' | 'OFFICE' | 'SLEEP'
export type ResponseStyle = 'normal' | 'short'

export interface OperatorState {
  mode: OperatorMode
  responseStyle: ResponseStyle
  availableForQuestions: boolean
}

export function getOperatorState(): OperatorState
```
Movés ahí la lectura/parseo de `system/OPERATOR_STATE.yaml` que hoy vive inline en `readSystemContext()` de `index.ts` (mismo `parseYaml`, mismo path, default a `PRODUCT`/`normal`/`true` si el archivo no existe o algún campo falta — no romper el comportamiento actual si el YAML está incompleto). `index.ts` pasa a importar `getOperatorState()` en vez de tener la lógica duplicada; `readSystemContext()` queda como wrapper liviano que la llama y loguea (no le cambies la firma ni dónde se invoca).

### 2. Gating en `orchestrator/src/telegram.ts`
Cada una de las 3 funciones llama a `getOperatorState()` al entrar y decide:

- **`mode === 'SLEEP'`** → no manda nada, ni siquiera intenta `fetch`. Logueá localmente (`log('[telegram] SLEEP — notificación suprimida: ...')` con un resumen corto) para que quede rastro en el log del loop aunque no llegue al celu. El gate humano (`needsHumanApproval` en STATE.json) sigue activo igual — SLEEP no aprueba nada solo, solo no te despierta. Esto aplica a `notifyGate`, `notifyDeployed` y `notifyReleaseFailed` por igual.
- **`mode === 'OFFICE'` con `responseStyle === 'short'`** → mensaje compacto: para `notifyGate`, solo el featureId + primera línea del detalle (sin el resto) + los mismos botones inline (la aprobación Sí/No tiene que seguir andando igual, eso es justamente el formato "OFFICE: solo preguntas Sí/No o A/B/C" del comentario del YAML). Para `notifyDeployed`/`notifyReleaseFailed`, recortá a una sola línea (sin el detalle de errores ni el `tnaNote` completo — solo featureId + resultado).
- **`mode === 'PRODUCT'`** (o cualquier otro caso, incluido YAML ausente) → comportamiento actual sin cambios, mensaje completo.

No dupliques la lógica de truncado/formato 3 veces — extraé un helper interno tipo `formatForMode(full: string, short: string, mode, style)` o similar si te simplifica, pero sin sobre-ingeniería.

### 3. Tests
- `operator-state.test.ts`: lee YAML válido con cada combinación de mode/style; YAML ausente → defaults; campo faltante → default parcial.
- `telegram.test.ts` (agregar casos si el archivo ya existe, o crear si no): mockeá `getOperatorState()` (inyectable o vía mock de módulo, lo que ya uses en el resto del proyecto para mocks — mirá `reviewer.test.ts` como referencia de estilo de mocks recientes) y confirmá:
  - SLEEP → `fetch`/`tg` NUNCA se llama, para las 3 funciones.
  - OFFICE + short → el body del mensaje es el compacto, pero `notifyGate` sigue mandando el `inline_keyboard` con Aprobar/Rechazar intacto.
  - PRODUCT → comportamiento idéntico al actual (mensaje completo).

## Restricciones
- NO toques la lógica de reintento (`for attempt 1..5`) ni el wrapper `tg()`/fetch — el cambio es solo "¿se manda o no, y con qué texto?", no el transporte.
- NO toques `gates.ts` ni `setHumanGate()` — el gate humano (bloqueo del loop hasta `npm run approve`) sigue existiendo igual en SLEEP; lo único que cambia es si te avisa por Telegram o no.
- NO implementes nada de "loops nocturnos sin input humano" — eso es S-004, otro item del backlog, fuera de este scope.
- NO agregues dependencias nuevas.

## Entrega
- Branch `feature/s002-operator-state-gating`, sin push ni merge.
- Typecheck + test suite completa en verde.
- Mostrame: el diff de `operator-state.ts`, cómo quedó cada una de las 3 funciones de `telegram.ts`, y los casos de test cubiertos.
