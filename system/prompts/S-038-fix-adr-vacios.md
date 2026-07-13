# S-038 — Fix: ADR auto-log genera ADRs vacíos

> Prompt para Claude Code. Ejecutor: Sonnet. Repo: `augusto-os`. Autorizado a commitear y pushear a `main`.
> Diagnóstico ya hecho (Cowork, 2026-07-13) — no volvas a redescubrir la causa, andá directo al fix.

## Contexto

Desde ~2026-07-06 todos los ADR que emite el loop salen vacíos: título, decisión, contexto, alternativas y
consecuencias en blanco, `Origen: Supuesto del agente ()`, `Target: sistema` aunque la feature sea de otro target.
El 2026-07-11 se sanearon a mano ADR-0041 a 0074 (28 entradas, backup en `DECISIONS.md.bak-20260711`, IDs anulados
no-reutilizables). **El bug sigue activo hoy**: ADR-0075, 0076, 0077 y 0078 (2026-07-12/13, features F-0025/F-0026)
también están vacíos — la limpieza manual no tocó la causa.

## Causa raíz (confirmada, no es hipótesis)

`orchestrator/src/executor.ts`:

```ts
const output = result.all ?? result.stdout ?? ''        // línea 161 — stdout crudo del CLI, es un JSON string
...
const { parsed } = parseClaudeJson(result.stdout ?? '')  // línea 168 — ya parsea ese JSON y saca .result como texto plano
...
return { ok: true, sessionId, output, ..., adrBlocks: parseAdrBlocks(output) }  // línea 207 — BUG: usa `output` (crudo), no `parsed.text`
```

El CLI corre con `--output-format json` (línea 138), así que `output` es el JSON stringificado completo de la
respuesta, no el texto del asistente. Los saltos de línea reales del mensaje quedan escapados como `\n` (dos
caracteres literales, no un salto de línea) dentro de ese string. `parseAdrBlocks`/`extractField` en `adr.ts` usa
una regex `^\s*campo:\s*(.*)$` con flag `m` (multilínea) que depende de saltos de línea *reales* para anclar `^`/`$`
por campo — contra un string sin saltos de línea reales, cada `extractField` no matchea nada y devuelve `''` para
todos los campos. Eso explica exactamente los síntomas: todo vacío, `origen` cae en el fallback
`Supuesto del agente ()`, `target` cae en el default `'sistema'`.

`parseClaudeJson` (en `metrics.ts`) ya resuelve esto correctamente para otro propósito (session id, tokens,
costo): parsea el JSON y devuelve `{ text: parsed.result, parsed }`, con el texto plano real. Ese `text` es lo que
había que pasarle a `parseAdrBlocks` desde el principio.

## Tareas

1. **Fix mínimo en `executor.ts`:** la variable `parsed` ya existe en scope (línea 168, se usa para session_id y
   métricas). Extendé su destructuring a `const { text, parsed } = parseClaudeJson(result.stdout ?? '')` y cambiá
   la línea 207 a `adrBlocks: parseAdrBlocks(text || output)` (fallback a `output` solo si el parseo de JSON
   falló, para no perder el ADR en ese caso raro).
2. **Defensa adicional en `adr.ts` → `appendAdr`:** si `draft.titulo` y `draft.decision` vienen ambos vacíos, no
   escribas la entrada — logueá un warning (`console.warn` o el logger que uses) y devolvé `null`/saltá el ID en
   vez de quemarlo. Esto evita que una futura regresión del mismo tipo vuelva a ensuciar `DECISIONS.md`. Ajustá el
   tipo de retorno de `appendAdr` y su único caller si hace falta.
3. **Test de regresión en `adr.test.ts`:** un caso que reproduzca el bug — armá un string con el formato real de
   `--output-format json` (saltos de línea escapados como `\n` literal dentro del JSON), pasalo por
   `parseClaudeJson` primero y confirmá que `parseAdrBlocks(text)` extrae los campos correctamente; y un caso
   separado que confirme que `parseAdrBlocks` sobre el JSON crudo (sin pasar por `parseClaudeJson`) da campos
   vacíos — así el test falla fuerte si alguien reintroduce el bug pasando `output` en vez de `text`.
4. **Sanear ADR-0075 a 0078:** son las 4 entradas vacías generadas después de la limpieza del 2026-07-11 (mismo
   patrón que las 28 anteriores). Eliminalas de `DECISIONS.md` siguiendo el mismo criterio que dejó la nota de
   saneamiento existente (línea 7): sumá una línea a esa nota (o una nueva) anulando 0075–0078 como no-reutilizables,
   backup antes de tocar el archivo.
5. **Verificación real:** no alcanza con que tsc/tests den verde — corré (o pedí correr) un step real del loop que
   dispare un ADR y confirmá a mano que el próximo ADR-00XX sale con título/decisión/contexto poblados y el target
   correcto. Si no podés disparar un step real, al menos armá un fixture con el JSON real que devuelve
   `claude --output-format json` (podés sacar un ejemplo de cualquier `orchestrator/logs/F-00XX-stepN.log`
   reciente) y confirmá con eso.

## Restricciones

- No toques el prompt del executor que le pide el bloque `===ADR===...===END ADR===` al modelo (líneas ~80-91) —
  el formato que emite el modelo está bien, el bug es 100% de parseo del lado del orquestador.
- No toques `parseClaudeJson` — ya funciona bien, solo hay que reusarla donde faltaba.
- Marcá `S-038` ✅ en `system/BACKLOG.md` al terminar, con fecha y una línea de qué se verificó.
- Commit + push a `main`. Veredicto: confirmá con un ejemplo concreto (ADR real generado post-fix, o el fixture
  verificado) que el bug está resuelto — no alcanza con "tsc verde".
