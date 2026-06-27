# Convenciones — augusto-os

Reglas que el sistema (y cualquier agente, sea Claude, Llama u otro) debe respetar para mantener la memoria coherente. Este archivo es **model-agnostic**: no asume qué modelo ejecuta. Define el contrato; el modelo lo cumple.

---

## 1. Máquina de estados de features / fixes

Todo ítem de trabajo (feature, fix, refactor) tiene exactamente **un** estado en cada momento. Fuente de verdad: `system/BACKLOG.md` (cola) + `system/PROGRESS.md` (histórico append-only de lo terminado).

```
idea → backlog → active → done   (auto-deploy en verde, sin gate humano)
                    │
                    ├──────► blocked   (la verificación falla / depende de algo externo)
                    └──────► waiting    (espera una acción de Augusto FUERA del loop, ej. una migración)
                              dropped   (descartado; se documenta por qué)
```

| Estado | Significado | Dónde vive |
|--------|-------------|-----------|
| `idea` | capturada, sin refinar | FEATURE-INTAKE.md / cola de ideas |
| `backlog` | refinada y priorizada, **pendiente** de empezar | BACKLOG.md |
| `active` (WIP) | **en ejecución ahora** por el loop o por Augusto | BACKLOG.md (marcada WIP) + `features/F-XXXX.md` |
| `review` | (transitorio) construida y mergeada local; deploya sola si la verificación da verde | branch |
| `done` | terminada y deployada a prod | **PROGRESS.md** (con pasos + commits) |
| `blocked` | la verificación falló (con aviso del error) o depende de algo externo | BACKLOG.md |
| `waiting` | espera una acción de Augusto FUERA del loop (ej. correr una migración) — NO el deploy, que es automático | BACKLOG.md |
| `dropped` | descartada; registrar motivo en un ADR | BACKLOG.md (tachada) |

**Reglas de transición:**
- Una feature entra al loop solo desde `backlog` o `active`.
- Al completar todos los steps, corre `runReleaseChecks`. Si da **verde** → **auto-deploy** (push a main → Vercel) + aviso por Telegram → `done`. Si **falla** → `blocked` + aviso del error por Telegram (NO deploya). No hay gate humano de deploy (ver ADR-0019).
- Al pasar a `done` se appendea a `PROGRESS.md` y se marca ✅ en `BACKLOG.md`.
- `blocked`/`waiting` deben nombrar **de qué** dependen (otra feature, una migración, un OK).

> Regla práctica para Augusto: para saber "qué se está haciendo ahora" mirá los ítems `active` en BACKLOG. Para el histórico, PROGRESS.md. Para "por qué se hizo así", DECISIONS.md (ADR).

---

## 2. ADR automático — el loop documenta sus decisiones solo

**Objetivo:** que el orquestador anote en `DECISIONS.md` cada decisión de diseño que tome durante un step, declarando su **Origen** (instrucción de Augusto vs. supuesto del agente). Esto hace la memoria portable entre modelos: si mañana el Builder es Llama en vez de Sonnet, el ADR sigue siendo legible y el contexto no se pierde.

**Contrato (qué debe cumplir el loop):**

1. **Cuándo escribir un ADR.** El Planner/Executor debe emitir una entrada ADR cuando, durante un step, tome una decisión que cumpla *cualquiera* de:
   - elige entre dos o más enfoques técnicos no triviales (no "qué nombre de variable", sí "qué patrón de aislamiento");
   - introduce una convención nueva o rompe una existente;
   - asume algo que Augusto no especificó y que cambiaría el resultado si fuera distinto.
   Steps mecánicos (rename de copy, fix de typecheck) **no** generan ADR.

2. **Formato.** Usar el template de `DECISIONS.md` (ID `ADR-XXXX` autoincremental, fecha, **Estado**, **Origen**, **Target**, Decisión, Contexto, Alternativas, Consecuencias).

3. **Clasificación de Origen — la regla clave:**
   - Si la decisión deriva de una instrucción explícita en el `features/F-XXXX.md` o de un mensaje de Augusto → `Instrucción de Augusto`.
   - Si el agente eligió por criterio propio sin instrucción explícita → `Supuesto del agente`. **Estos son los que Augusto querrá auditar.**
   - Si es consecuencia técnica forzada de otro ADR → `Derivada`.

4. **Dónde, en el ciclo.** El ADR se escribe en la fase de cierre del step (junto al commit atómico), no al final de toda la feature, para no perder decisiones intermedias si el loop se corta.

5. **Output para Augusto.** Al terminar una feature, el veredicto en castellano debe listar los ADR nuevos con su Origen, resaltando los `Supuesto del agente` para review rápida.

**Estado de implementación:** implementado — S-009 done 2026-06-25. `appendAdr()` + `parseAdrBlocks()` viven en `orchestrator/src/adr.ts`; `executor.ts` llama a `parseAdrBlocks` sobre el output de cada step; `index.ts` llama a `appendAdr` al cerrar el step; `autopilot.ts` lo usa para el ADR del picking nocturno. 13 tests verdes en `adr.test.ts`.

---

---

## 3. Regla de IDs (append-only)

Los IDs de work-items (`S-XXX` sistema · `F-XXXX` features · `SP-XXX` Kredy · `SPT-XXX` Spensiv · `AR-XXX` Argos) son **append-only**:

- **Nunca se reusan ni se renumeran.** Un ID asignado es inmutable aunque el ítem se descarte.
- Un ítem nuevo toma siempre el **próximo ID libre** (max(IDs existentes) + 1).
- Los IDs "saltados" son huecos documentados; no se rellenan retroactivamente.

**Motivación:** S-022 fue reasignado de "rotación de logs" a "Dashboard Operaciones" (commit `e79e7ee`, 2026-06-27) y el ítem original fue renumerado a S-025. Eso crea referencias rotas en git. Esta regla previene futuros accidentes equivalentes.

**Huecos conocidos:** S-011 y S-012 no fueron asignados en el período 2026-06-19 a 2026-06-25 (la secuencia S-010 → S-013 los saltó sin documentar). Se mantienen como huecos permanentes.

**Mapeo de colisión histórica (resuelto en S-026, 2026-06-27):**
- `S-022 (original)` = "Rotación/retención de logs" → ahora `S-025` (pending)
- `S-022 (actual)` = "Dashboard → vista Operaciones" → done 2026-06-27

Si una referencia antigua cita "S-022 (rotación de logs)", apunta a lo que hoy es **S-025**.

---

## 4. Portabilidad de modelo (por qué importa el punto 2)

El diseño separa **rol** (Planner, Builder/Executor, Verifier, Reviewer) de **modelo** (hoy Opus para planificar, Sonnet headless para ejecutar). La memoria del sistema —ADR, BACKLOG, PROGRESS, CONVENTIONS— es texto plano, sin dependencia del modelo. Esto permite:
- Swapear el modelo de un rol (ej. Builder → Llama local) sin perder contexto: el modelo nuevo lee `system/` y retoma.
- Dar el ADR a un agente externo para auditar el trabajo sin reconstruir el contexto desde cero.
Regla: **ningún rol persiste estado en su propio razonamiento.** Todo lo que importa se escribe en `system/`.
