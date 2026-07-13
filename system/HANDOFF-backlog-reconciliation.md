> **RESUELTO 2026-07-08 (Cowork, sesión nueva).** Los 5 pasos de "Qué hacer en la sesión nueva" están cerrados: SP-001/002/003/004 confirmadas y pasadas a `done` en `BACKLOG.md`, con evidencia en `PROGRESS.md` (entrada "Reconciliación de BACKLOG.md: 4 filas stale de Kredy"). Barrido del resto del backlog (Sistema/Argos) hecho, sin más filas stale detectadas. Pendiente real: correr `npm test` en la máquina de Augusto (no se pudo en el sandbox de Cowork, ver nota en PROGRESS.md).

# Handoff — Reconciliación de BACKLOG.md (arrancado 2026-07-08, para retomar en sesión nueva)

> Punto de entrada para retomar esto en una sesión nueva de Cowork. Esto arrancó como
> fast-follow del fix del sync de `BACKLOG.md` (ver abajo) — reviso items
> `pending`/`waiting`/`blocked` del backlog contra el estado real del código, porque ya
> encontré varios que huelen a stale (trabajo ya shippeado que nunca se marcó `done`).
> Quedó a mitad de camino a propósito: Augusto pidió que esto se ejecute en una sesión
> de Cowork nueva, no en la misma donde arranqué la investigación.

## Por qué esto importa ahora (contexto: bug de hoy)

Hoy (2026-07-08) se rompió una fila de `BACKLOG.md` a mano (una celda `|` de más
desalineó ID/P/Descripción/Estado/Ejecutor), y el sync la subió a Supabase (`orch_backlog`)
con el Ejecutor equivocado, en silencio — el dashboard mostraba el item como pendiente
cuando ya estaba resuelto. Se corrigió:
- `orchestrator/src/sync.ts` → `parseBacklog()` ahora exige exactamente 7 celdas por fila
  y loguea un warning + saltea la fila si no cierra (antes toleraba cualquier cosa ≥6/≥7
  celdas y desplazaba columnas en silencio).
- `orchestrator/src/sync.test.ts` (nuevo) → corre `parseBacklog` contra el `BACKLOG.md`
  real y falla si hay algún warning. Ya wireado a `npm test` (testCmd del target "sistema").
- `sync.ts` también tenía un bug latente: importar el archivo disparaba su loop infinito
  (`run()`) como side-effect — se agregó un guard `isMain` para que solo arranque con
  `npm run sync`, nunca al importarlo (necesario para que el test nuevo no dispare un
  sync real contra Supabase).

**Verificado en la máquina de Augusto:** `npm test` en `orchestrator/` → 336 tests,
18 archivos, todo verde, incluidos los 2 nuevos de `sync.test.ts`.

Mientras se revisaba esto, surgió la pregunta obvia: si una fila puede quedar
desalineada por un typo, ¿cuántas filas del backlog están simplemente **desactualizadas**
(el trabajo se hizo pero la fila nunca pasó a `done`)? Ahí arrancó esta reconciliación,
en el estilo de **S-026** (`BACKLOG.md` línea ~40 — "auditoría de estados reales cruzando
BACKLOG/PROGRESS/prompts/git").

## Sospecha concreta ya detectada (evidencia parcial, sin confirmar del todo)

Sección **Kredy** de `BACKLOG.md` (líneas ~51-54):

```
| SP-001 | 1 | Sprint S-D: Búsqueda unificada por CUIL/DNI en consola (depende migración S-A/B/C aprobada) | blocked | manual |
| SP-002 | 1 | Sprint S-E: Límite de originación por CUIL en frontend | blocked | manual |
| SP-003 | 2 | Migración SA identity backbone — espera OK de Augusto | waiting | manual |
| SP-004 | 2 | Migración AP Commission V2 — espera OK de Augusto | waiting | manual |
```

Estas 4 filas usan una nomenclatura vieja (sprints "S-A/B/C/D/E") que no aparece en
ningún otro lado de `system/` — probablemente pre-fechan la convención `SP-XXX` actual.
Señales de que **ya están hechas** y nunca se marcaron:

1. **SP-003 (identity backbone) + SP-002 (límite CUIL frontend):** un deploy de
   `kredy-ap` (entonces todavía repo "spensiv") con el commit `feat(identity): límite de
   originación por CUIL + identidad universal de deudor + self-AP` — menciona
   `lib/identity/resolvePerson.ts` (CUIL→DNI→nombre→crear), `checkDebtorLimit`
   por-CUIL/persona, y "Banners identidad/exposición en tarjetas de PreApproval" +
   "Página de Personas: cards → tabla sorteable con exposición viva" (esto es el
   frontend de SP-002). Por fecha, cae junto a **SP-009** (`done 2026-06-25 (deployado)`,
   F-0005, "Gate de límite por vínculo... en preApprove") — muy probablemente el mismo
   feature o inmediatamente adyacente.
2. **SP-004 (AP Commission V2):** otro deploy con commit `feat(ap): 3-tab shell +
   cuenta corriente de comisión dual (nuevo esquema de fondos) — Sprint AP Commission V2`
   (menciona `docs/migration-ap-commission-v2.sql (ya aplicada en prod)`, tabla
   `ApWithdrawal`, eventos `gross_due_realized`/`commission_accrued`/`commission_paid`).
   Este deploy específico salió en `ERROR`, pero el siguiente commit
   (`feat(ap): sprint 2 — devengo con concepto, ajuste manual, limite solo CUIL`)
   construye directamente sobre esos conceptos (`realizeCommissionsForPayment`,
   `apMyCommissionLedger`) y sí deployó `READY`.
   **Confirmación independiente hoy:** el cron `/api/cron/ap-reconcile` de Kredy (activo
   en prod ahora mismo, corre diario 06:00 UTC) usa exactamente esos conceptos
   (`realizeCommissionsForPayment`, `apLedgerEvent`, `commission_realized`) — no podría
   funcionar si la migración no estuviera aplicada. Y la DB de Kredy en Neon (verificada
   hoy, ver `PROGRESS.md` S-010) tiene las tablas `ap_withdrawals`, `ap_ledger_events`
   con datos reales.
3. **SP-001 (Consulta 360° / búsqueda unificada CUIL-DNI):** el sidebar de `kredy-ap`
   en prod (visto hoy en el smoke test post-migración) tiene un ítem **"Consulta 360°"**,
   y la DB tiene tablas `consultas_360` (28 filas) y `consulta_360_cache` (55 filas) con
   uso real. Estaba leyendo `kredy/app/dashboard/consulta-360/page.tsx` para confirmar
   que busca por CUIL/DNI cuando se cortó la sesión — **este es el primer paso a
   retomar**, el archivo ya está localizado.

## Qué hacer en la sesión nueva (en orden)

1. **Cerrar la verificación de SP-001:** leer
   `C:\Users\Augusto\Downloads\Proyectos\kredy\app\dashboard\consulta-360\page.tsx`
   (y el router/procedure que llama) y confirmar que busca por CUIL o DNI. Si sí,
   SP-001 está resuelto por esa feature.
2. **Identificar el F-XXXX exacto de SP-004 (AP Commission V2):** buscar en
   `kredy/features/` (si existe) o en `augusto-os/system/features/` specs cuyo nombre
   mencione "commission" o "AP" con fecha posterior a F-0007 (2026-06-25). Si no hay
   spec formal (pudo haberse hecho fuera del loop, a mano), documentarlo como tal.
3. **Grep general en `PROGRESS.md`** por "identity", "CUIL", "commission", "360" para
   ver si hay entradas que ya narran este trabajo con más detalle/fecha que lo que
   quedó en `BACKLOG.md`.
4. **Actualizar las 4 filas SP-001/002/003/004** en `BACKLOG.md` de `blocked`/`waiting`
   a `done`, citando el feature/fecha/evidencia encontrada — mismo estilo que la
   entrada de S-026 o la de S-010/S-035 de hoy. **Ojo con el formato de la tabla**:
   exactamente 5 columnas (`| ID | P | Descripción | Estado | Ejecutor |`), sin pipes
   de más — es literalmente el bug que se corrigió hoy.
5. **Correr `npm test` en `orchestrator/`** después de editar (en la máquina de Augusto,
   no en el sandbox de Cowork — el sandbox tiene un mismatch de plataforma con
   `node_modules`, rollup/esbuild compilados para Windows). Tiene que dar 336+ tests
   verdes, incluyendo `sync.test.ts`.
6. **Barrer el resto del backlog** (Sistema/Spensiv/Argos, no solo Kredy) con el mismo
   criterio: cualquier fila `pending`/`waiting`/`blocked` con más de ~2 semanas y sin
   actividad reciente es candidata a stale — cruzar contra `PROGRESS.md`/git antes de
   tocarla, no asumir por el nombre.

## Archivos relevantes

- `system/BACKLOG.md` — el archivo a corregir (sección Kredy, líneas ~47-64 en la
  versión de hoy; puede haber corrido si se agregaron filas nuevas).
- `system/PROGRESS.md` — log narrativo, fuente para fechas/features reales.
- `orchestrator/src/sync.ts` / `sync.test.ts` — el parser + su test, ya arreglados hoy.
- Repo `kredy` (`C:\Users\Augusto\Downloads\Proyectos\kredy`) — código real para
  verificar qué está deployado (no confiar solo en nombres de commits).
- Supabase MCP / Vercel MCP — para cruzar deployments y tablas en vivo si hace falta
  más evidencia (mismo enfoque que usé hoy: `list_deployments` + `list_tables`).
