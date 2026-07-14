# AR-022 — Fix: reclasificación carry/portfolio de `fci_lots` no es atómica + posible desincronización UI↔DB

> Prompt para Claude Code. Ejecutor: Sonnet. Repo: `portfolio-tracker` (Argos). Proyecto Supabase: `wwzocpcolgdzkvcigchj`
> (es el único ambiente — Argos no tiene DB dev, ver AR-002 en BACKLOG.md: `dbModel: none`, todo corre contra la
> base real). Diagnóstico parcial ya hecho (Cowork, 2026-07-13) — parte 1 está confirmada, parte 2 queda abierta.
> **No autorizado a deployar a prod ni a escribir sobre `fci_lots` de datos reales sin aprobación explícita de
> Augusto** (CLAUDE.md: acciones sobre dinero real/cuentas se preparan, no se ejecutan solas). Sí autorizado a
> commitear a una rama y abrir el fix para revisión.

## Contexto

Argos tiene un motor de "carry trade" (caución financiando FCI) en el portfolio Alycbur. Cada lote de suscripción
FCI (`fci_lots`) tiene un campo `tipo`: `'carry'` | `'portfolio'`. El dashboard "Fondos en Caución"
(`FundingEngine.jsx` → `useFciLotEngine.js`) suma únicamente los lotes `tipo='carry'` para calcular Saldo FCI y
Cobertura (caución vs FCI) — número que Augusto usa activamente para decidir apalancamiento real (cuánta caución
tomar, cuánto FCI suscribir).

El 2026-07-13 Augusto reportó una divergencia: 4 lotes de **Alpha Renta Capital Pesos - Clase B**
(fci_id `8f4a91e5-19fd-428c-b358-ac1b856ab32d`, portfolio Alycbur `f30b1bb8-6ee8-4b2f-8e18-ec22345c01cd`, lot_ids
`5b02d8d8-b863-4b6e-a21a-5a2a820c4f0a`, `8da07976-a407-46ea-9901-2f6bba4e898f`,
`dd8e8a08-d8ae-4c37-affa-5947cd3c5df1`, `508a22d9-c49a-41ce-a232-8c2a3a15adcb`) tienen **`tipo='portfolio'` en la
base ahora mismo**, pero **la webapp los sigue mostrando y sumando en "Fondos en Caución" incluso después de un
hard-refresh** (valuación ~$3.07M ARS de esos 4 lotes, sumados al total de $8,876,685.67 que muestra el dashboard).
Augusto recuerda que ese día estuvo probando manualmente el toggle portfolio↔carry para verificar que funcionara.

## Causa raíz #1 (confirmada) — reclasificación no atómica

`src/features/fci/services/fciService.js`, función de reclasificación (~líneas 549-577):

```js
const { data: lot, error: lotErr } = await supabase
    .from('fci_lots')
    .select('tipo')
    .eq('id', lotId)
    .single();
if (lotErr) throw lotErr;

const tipoAnterior = lot.tipo || 'portfolio';
if (tipoAnterior === newTipo) return;

const { error: updateErr } = await supabase
    .from('fci_lots')
    .update({ tipo: newTipo })
    .eq('id', lotId);
if (updateErr) throw updateErr;

const { error: auditErr } = await supabase
    .from('fci_lot_context_changes')
    .insert([{ user_id: userId, lot_id: lotId, tipo_anterior: tipoAnterior, tipo_nuevo: newTipo, notas }]);
if (auditErr) throw auditErr;
```

El `UPDATE` sobre `fci_lots` y el `INSERT` de auditoría en `fci_lot_context_changes` son dos llamadas separadas,
sin transacción. Si la segunda falla (o hay un retry/doble-click que dispara la función dos veces en paralelo),
`tipo` queda mutado en la base sin ningún registro que lo explique en el historial.

**Evidencia real:** consultando `fci_lot_context_changes` para esos 4 lot_ids, hay 6 cambios registrados entre
2026-06-02 y 2026-06-06 (Augusto probando el toggle), y el **último registro logueado (2026-06-06, ~02:10 UTC)
deja `tipo_nuevo='carry'`** para los 4. Pero el valor actual en `fci_lots.tipo` es `'portfolio'` — un cambio que
no tiene ningún row correspondiente en `fci_lot_context_changes`. La auditoría no refleja el estado real.

## Causa raíz #2 (abierta, requiere tu investigación) — desincronización UI↔DB

Con `tipo='portfolio'` confirmado en la base, el filtro de `useFciLotEngine.js` (línea 326-327:
`carryPositions = positions.filter(p => p.tipo === 'carry')`) debería excluir estos 4 lotes de "Fondos en
Caución". La UI en vivo (confirmado por Augusto con hard-refresh) los sigue mostrando. Posibles hipótesis a
descartar, en orden de probabilidad:

1. **Cache de React Query** con `staleTime`/`gcTime` largo en el hook que carga los lotes (`loadLots()` en
   `useFciLotEngine.js` o lo que envuelva a `fciService`) que sobrevive a un hard-refresh si hay Service Worker o
   persistencia de cache habilitada. Revisar configuración de QueryClient del proyecto (`App.jsx`).
2. **Otra fuente de datos** para `carryPositions`/`carryTotals` que no pasa por `useFciLotEngine.js` en el camino
   que realmente usa `FundingEngine.jsx` en producción — confirmar que no hay una segunda implementación o un
   flag/feature-toggle que cambie el hook usado.
3. **Lectura con rol distinto**: la consulta que hice yo fue vía Supabase MCP (probablemente service_role);
   confirmar que no hay RLS que haga que la sesión autenticada de Augusto vea una fila distinta (no debería, es un
   `select` directo por PK, pero descartalo).
4. **El valor cambió de nuevo** entre que Augusto miró la UI y que yo consulté la base (posible pero coincide mal
   con "ya hice hard-refresh y sigue apareciendo" — verificalo vos con timestamps `updated_at` de los 4 lotes al
   momento de tu diagnóstico).

No asumas la causa — reproducila. Si hace falta, agregá logging temporal (`console.log` del array `positions`
justo antes del filtro en `useFciLotEngine.js`) y pedile a Augusto (o corré vos con QA visual si tenés acceso al
entorno corriendo) que confirme qué `tipo` ve la UI para esos 4 lotes en el momento exacto de la carga.

## Tareas

1. **Diagnosticar y resolver la causa raíz #2** antes que nada — sin esto no sabemos si el número que Augusto está
   usando ahora mismo ($8,876,685.67 / cobertura 27.3%) es confiable.
2. **Fix de la atomicidad (causa #1):** envolvé el `UPDATE` + `INSERT` en una transacción real. Como el cliente
   JS de Supabase no soporta transacciones multi-statement directamente, la forma correcta es una función
   Postgres (`SECURITY DEFINER` o `INVOKER` según corresponda a las policies RLS existentes) expuesta vía RPC,
   ej. `reclassify_fci_lot(lot_id uuid, new_tipo text, user_id uuid, notas text)` que haga ambas escrituras en un
   solo bloque transaccional y falle atómico si cualquiera de las dos falla. Actualizá `fciService.js` para
   llamar a esa RPC en vez de las dos queries sueltas.
   - **Esto requiere una migración SQL nueva** (`supabase/migrations/`). Por la regla de CLAUDE.md sobre
     migraciones/SQL en producción, **no la apliques directamente contra `wwzocpcolgdzkvcigchj`** — dejá la
     migración escrita y lista, y pedí confirmación explícita antes de correr `apply_migration` o el equivalente
     del CLI de Supabase.
3. **Resolver el estado actual de los 4 lotes en disputa:** no decidas vos qué `tipo` es el "correcto" — es plata
   real y el número alimenta una decisión de apalancamiento en curso. Una vez resuelta la causa #2, reportá con
   claridad: (a) qué `tipo` tienen hoy en la base, (b) qué muestra la UI, (c) cuál de los dos es el que el código
   *debería* mostrar según el filtro real. Dejá la corrección de datos (si hace falta) como una acción propuesta,
   no ejecutada, salvo que Augusto la confirme explícitamente en el momento.
4. **Test de regresión:** un test que reproduzca el fix de la RPC — reclasificar un lote, simular fallo en el paso
   de auditoría (mock), y confirmar que la transacción completa se revierte (ni `tipo` ni el log cambian). Otro
   test que confirme el camino feliz (ambos escriben, ambos consistentes).
5. **Investigación de causa #2 documentada:** aunque no requiera cambio de código (podría ser puramente de cache),
   dejá por escrito en el PR/commit qué encontraste y por qué la UI mostraba algo distinto a la base.

## Restricciones

- No toques `calcularSpreadPorCaucion`, la anualización canónica (`annualizeNominalTNA`), ni el cálculo de P&L —
  esto es estrictamente sobre la integridad de la reclasificación carry/portfolio, mismo criterio que AR-005.
- No apliques la migración SQL nueva contra prod sin aprobación explícita — dejala lista y avisá.
- No sobrescribas `fci_lots.tipo` de los 4 lotes en disputa sin aprobación explícita — es dato real, no de test.
- No deployes a Vercel/prod al finalizar — dejá el fix en una rama, commit claro, listo para review.
- Marcá `AR-022` en `system/BACKLOG.md` al terminar (estado real: `armado` si falta aprobar la migración/dato, o
  `done` si Augusto ya aprobó todo en la misma sesión), con fecha y un resumen de qué se encontró en la causa #2.
- Si el hallazgo de causa #2 cambia el número de cobertura real, decílo explícitamente en el resumen final — no
  lo entierres en el diff.
