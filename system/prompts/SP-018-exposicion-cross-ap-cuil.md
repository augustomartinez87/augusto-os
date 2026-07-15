> Prompt para Claude Code. Ejecutor: Sonnet. Repo: kredy. Autorizado a commitear y pushear a main (sin deploy manual — depende de que exista Vercel prod para kredy; si no existe, dejar el push a main igual).

## Contexto

`lib/risk/debtorExposure.ts` y `lib/risk/debtorLimit.ts` calculan el límite de originación por deudor (`checkDebtorLimit`, usado en `server/routers/ap.ts` antes de pre-aprobar un préstamo). Hoy TODO el cálculo está scoped a `userId` (el libro de un Agente Productor específico):

- `Person` es una tabla per-`userId` — cada AP tiene su propia fila de Person incluso para el mismo CUIL (`prisma/schema.prisma`, `model Person`, índice `[userId, cuit]`, sin unique global de `cuit`).
- `getDebtorExposure(db, userId, personId)` filtra `Loan` por `{ userId, personId, direction: 'lender' }`.
- `getPortfolioLiveExposure(db, userId)` suma todo el libro activo de ESE `userId`.
- `checkDebtorLimit` compara `currentExposure` (de ese AP) contra `limit = maxDebtorExposurePct * portfolioLiveExposure` (también de ese AP).

Decisión de Augusto (2026-07-13, registrada en BACKLOG.md SP-018): si el mismo CUIL pide plata en 2 APs distintos, cada AP lo ve hoy como exposición fresca — un deudor puede resetear su límite cambiando de AP. Esto tiene que ser cross-AP: la exposición de un CUIL debe contar la deuda que tiene en TODOS los APs de la plataforma, no solo en el libro del AP que está evaluando el nuevo préstamo.

## Diseño

**Qué se globaliza y qué no** (para no romper el modelo de riesgo por-AP sin que nadie lo haya pedido):

- **Numerador (exposición actual del deudor) → GLOBAL por CUIL.** Sumar `principalOutstanding` de todos los `Loan` activos con `direction='lender'` de CUALQUIER `userId` cuyo `Person.cuit` matchee, más las TPP no cobradas del mismo CUIL en cualquier `userId`.
- **Denominador (límite = % del portfolio) → se mantiene por-AP.** El % es el apetito de riesgo de CADA AP sobre SU propio libro, no tiene sentido fusionarlo entre APs. Un AP evalúa "¿este CUIL, con toda su deuda conocida en la plataforma, superaría el X% de MI cartera si le presto esto?".

Si esta separación numerador-global/denominador-local no es lo que Augusto tenía en mente, es la decisión de diseño con más impacto en el resultado — dejarla explícita en el ADR que emitas al final, no asumirla en silencio sin loguearla.

**Cómo resolver "mismo CUIL, distinto AP" sin unique constraint:** no hay forma de hacer `db.person.findMany({ where: { cuit } })` cross-userId de forma segura si `cuit` puede tener formatos inconsistentes (con/sin guiones, ceros a la izquierda) entre AP. Normalizá el CUIL (solo dígitos) antes de comparar — revisá si ya existe un normalizador en `lib/identity/resolvePerson.ts` o `server/services/identity.service.ts` (S-003) y reusalo; si no existe, agregá uno mínimo y compartido, no inline en el risk module.

**Tareas:**

1. Nueva función `getGlobalDebtorExposureByCuil(db, cuil, excludeUserId?)` en `lib/risk/debtorExposure.ts` — dado un CUIL normalizado, busca TODOS los `Person` (cualquier `userId`) con ese CUIL, junta sus `Loan` activos (`direction='lender'`) + TPP no cobradas, agrega por moneda igual que `getDebtorExposure` pero sin filtro de `userId`. Devolvé también el detalle por AP (qué `userId`/AP tiene qué parte de la exposición) — útil para que el operador vea de dónde viene la deuda, no solo el total.
2. `checkDebtorLimit` pasa a usar `currentExposure` de `getGlobalDebtorExposureByCuil` (numerador) en vez de `getDebtorExposure` (que sigue existiendo, la necesita el detalle de préstamos del AP local para otras pantallas — no la borres, solo dejá de usarla como fuente del numerador acá). El denominador (`portfolioTotal`) sigue viniendo de `getPortfolioLiveExposure(db, userId)` sin cambios.
3. Si `Person.identityStatus !== 'verified'` para la persona local (el AP que está evaluando), el comportamiento de `pending` no cambia (sigue en `flag`, nunca bloquea) — la resolución cross-AP solo aplica cuando hay CUIL verificado para comparar.
4. `reconcileExposure` (usado en tests, §9.4 original) queda como está — es un chequeo interno de reconciliación por-AP, no forma parte de la superficie cross-AP.
5. Tests: extendé `debtorExposure.test.ts`/`debtorLimit.test.ts` (si no existen, mirá el patrón de tests de `resolvePerson`) con el caso central — mismo CUIL, dos `userId` distintos, cada uno con un préstamo activo — y verificá que `checkDebtorLimit` desde CUALQUIERA de los dos AP ve la suma de ambos como `currentExposure`, no solo la suya.

## Restricciones clave

- No tocar `annualizeNominalTNA`, cálculo de cuota, ni ningún motor de mutuo/pagaré — esto es puramente el gate de riesgo pre-aprobación.
- No exponer en la UI del AP el detalle de préstamos de otro AP para ese CUIL (nombre del otro AP, montos exactos) salvo el total agregado — privacidad entre AP. Si hace falta desglose para debug, que quede en logs/consola de admin, no en la pantalla del AP evaluando el préstamo.
- `TNA`/tasa: no aplica acá, pero recordá la regla general del proyecto — nunca se muestra al prestatario.
- No migrar `Person` a una tabla global ni tocar el schema para agregar unique de `cuit` — es un cambio de mayor alcance que no corresponde a este fix; resolvé la agregación en query, no en schema.

## Al terminar

`npx tsc --noEmit` limpio, tests nuevos en verde, ADR si tomaste alguna decisión de diseño no cubierta arriba (especialmente si te desviaste del numerador-global/denominador-local). Reportá con qué CUIL/escenario probaste el caso cross-AP.
