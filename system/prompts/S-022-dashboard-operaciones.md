# S-022 — Dashboard: vista Operaciones (landing + memoria)

> Prompt para Claude Code. Ejecutor: Sonnet. Repo: `augusto-os`. Autorizado a commitear y pushear a `main`.

## Contexto

El dashboard de augusto-os (`dashboard/index.html` — HTML estático single-file, vanilla JS + cliente Supabase por CDN, polling 5s) fue **rediseñado** de un dashboard con tabs co-iguales (Loop/Backlog/Ideas) a una **vista Operaciones** orientada a supervisar al equipo de agentes. El cambio **ya está hecho en el working tree, sin commitear**. Tu trabajo es landearlo en `main` y dejar la memoria del sistema coherente. **NO reescribas el archivo ni rediseñes nada** — solo verificás, commiteás y documentás.

Las decisiones de producto que el rediseño implementa vienen de una sesión de diseño con Augusto. Respetalas, no las reabras:

- **Roster honesto = etapas reales del pipeline, NO 5 agentes ficticios.** Según `system/ARQUITECTURA-ACTUAL.md`, solo Planner (Opus) y Builder (Sonnet) son agentes LLM reales; Verifier y Deploy son código determinístico (se muestran con tag "auto"). **Researcher no existe y no se muestra.** Como el loop es secuencial, solo se enciende quien tiene la posta.
- **El hero responde "quién tiene la posta"**, derivado de `orch_runs`/`orch_steps` por la función `derivePosta(run, allSteps)`.
- **El feed muestra deltas** (pasos `done` + features completadas), **NUNCA el log crudo**. El log crudo pasó a un panel secundario colapsable.
- Se preservó intacto: envío de ideas, mode-bar PRODUCT/OFFICE/SLEEP (→ `orch_operator_state`), backlog por proyecto, config Supabase y el polling de 5s. El modo y las utilidades (Backlog/Ideas/Log) están arriba, accesibles desde el tope.

## Tareas

1. **Verificar integridad del archivo antes de tocar nada.** `dashboard/index.html` debe estar completo: empieza con `<!DOCTYPE html>`, termina con `</html>`, y el `<script>` final contiene `derivePosta`, `renderRoster`, `renderHero`, `renderFeed`, `renderBacklog`, `sendIdea`, las constantes `SUPABASE_URL`/`SUPABASE_ANON_KEY` y `setInterval(refresh, 5000)`. **No debe aparecer la palabra "Researcher" en ningún lado.** Si el archivo estuviera truncado o incompleto, **PARÁ y avisá** (hubo un hipo de sincronización al escribirlo desde otra herramienta; conviene confirmar el contenido en disco).

2. **Commit + push a `main`.** Conventional commit:
   ```
   feat(dashboard): vista Operaciones — roster honesto (etapas reales) + loop hero + feed de deltas
   ```
   En el cuerpo, resumí las cuatro decisiones de arriba.

3. **Actualizar la memoria del sistema** (CONVENTIONS §1 y §2):
   - `BACKLOG.md` → agregar fila en la sección Sistema:
     `S-022 | ✅ | Dashboard → vista Operaciones (rediseño de IA: roster honesto de etapas reales, hero "quién tiene la posta", feed de deltas no-logs; preserva ideas/mode/backlog). Fast-follow de S-007/S-015 | done <fecha> (Claude Code)`
   - `PROGRESS.md` → append con el/los commit sha.
   - `DECISIONS.md` → nuevo ADR (ID autoincremental, usar el template):
     - **Decisión:** El roster del dashboard representa las etapas reales del pipeline (Planner/Builder LLM + Verifier/Deploy automáticos); no se fabrican agentes inexistentes (Researcher no se muestra). El feed se arma de deltas, no del log crudo.
     - **Origen:** `Instrucción de Augusto` (sesión de diseño de producto).
     - **Contexto:** evitar "teatro" — actividad decorativa que no refleja el sistema real. El manifiesto de producto exige no mentir actividad.
     - **Alternativas:** roster de 5 agentes con estado mockeado (rechazada: fabrica actividad).
     - **Consecuencias:** cuando existan agentes LLM reales nuevos (p.ej. Reviewer, Tester), se suman al roster sin tocar la arquitectura de la vista.

4. **Deploy: NO redeployes el dashboard.** Augusto valida el render en su celu y decide el redeploy. Si el push a `main` dispara una integración git de Vercel para el dashboard, avisalo explícitamente en el veredicto.

## Restricciones

- No tocar `orchestrator/` ni la lógica del loop.
- No cambiar el schema de Supabase ni las RLS.
- Mantener single-file: no partir el HTML en archivos separados.
- Veredicto final en castellano: commit sha(s), ADR nuevo con su Origen, y si hubo o no redeploy del dashboard.
