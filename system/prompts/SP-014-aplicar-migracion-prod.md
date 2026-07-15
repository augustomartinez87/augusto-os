> Prompt para Claude Code. Repo: kredy. Acción sobre base de datos de PRODUCCIÓN — Augusto dio OK explícito 2026-07-15 (Cowork).

## Contexto — actualizado tras el hallazgo de la sesión anterior

Encontraste 15 migraciones pendientes en vez de 1, y frenaste correctamente antes de tocar prod. Causa raíz identificada (Cowork, leyendo `system/MIGRATION-kredy-to-neon.md`): la migración Supabase→Neon de Kredy (S-010, cortada 2026-07-08) usó `npx prisma db push` para materializar el schema en el Neon nuevo (paso 2 del runbook) — `db push` sincroniza estructura pero **nunca escribe en `_prisma_migrations`**. Prod quedó con la estructura correcta (todo lo que ya existía en `schema.prisma` al 2026-07-08) pero sin historial de migraciones registrado — por eso las 14 viejas aparecen "pendientes" aunque ya estén aplicadas de hecho. La única que es realmente nueva es `20260715120000_collection_reminders_phone_alias`.

Esto es una hipótesis fundada, no un hecho confirmado — verificala antes de tocar nada, con el paso 1.

## Pasos — en este orden exacto, cada uno es un gate para el siguiente

### 1. Diff de solo-lectura: prod real vs `schema.prisma` actual

```
npx prisma migrate diff --from-url "%DIRECT_URL%" --to-schema-datamodel prisma/schema.prisma --script
```

(en PowerShell puede hacer falta `$env:DIRECT_URL` en vez de `%DIRECT_URL%` — usá la sintaxis que corresponda, la URL ya está en `.env`). Este comando NO modifica nada, solo imprime el SQL que haría falta para llevar la DB real al estado de `schema.prisma`.

**Resultado esperado si la hipótesis es correcta:** el diff sale vacío, o contiene ÚNICAMENTE las 2 columnas de SP-014 (`persons.phone`, `agent_configs.collectionAlias`) — nada más.

**Si el diff muestra CUALQUIER OTRA COSA** (tablas, columnas, constraints, índices que no sean esos 2 campos) — PARÁ. Eso significaría que prod está genuinamente atrasado en algo real, no es solo un problema de tracking. Reportá exactamente qué aparece en el diff y no sigas a los pasos siguientes.

### 2. Si el diff confirma la hipótesis (solo las 2 columnas de SP-014, nada más): marcar las 14 viejas como aplicadas

Una por una, en orden cronológico (no ejecutan SQL, solo escriben una fila en `_prisma_migrations` diciendo "esto ya está"):

```
npx prisma migrate resolve --applied 20250215120000_add_card_closing_schedule
npx prisma migrate resolve --applied 20260216120000_add_performance_indexes
npx prisma migrate resolve --applied 20260224130000_loan_phase1_accounting
npx prisma migrate resolve --applied 20260515120000_add_loan_schedule_prefs
npx prisma migrate resolve --applied 20260526120000_add_tags
npx prisma migrate resolve --applied 20260604120000_add_agent_and_preapprovals
npx prisma migrate resolve --applied 20260609120000_add_loan_producto
npx prisma migrate resolve --applied 20260610120000_ap_pipeline
npx prisma migrate resolve --applied 20260610140000_contact_identity
npx prisma migrate resolve --applied 20260610150000_ap_commission_ledger
npx prisma migrate resolve --applied 20260611120000_sa_identity_backbone
npx prisma migrate resolve --applied 20260611130000_agent_config_is_self
npx prisma migrate resolve --applied 20260613120000_add_refinancing_audit_trail
npx prisma migrate resolve --applied 20260613140000_add_pre_approved_expires_at
```

Confirmá con `npx prisma migrate status` que ahora dice que falta exactamente 1 (`20260715120000_collection_reminders_phone_alias`).

### 3. Recién ahora, aplicar la migración real de SP-014

```
npx prisma migrate deploy
```

Debe aplicar solo esa. `npx prisma migrate status` debe quedar "Database schema is up to date".

### 4. Backfill (igual que antes)

```
npx tsx scripts/backfill-person-phone.ts
```

Pegá el resumen completo en tu reporte.

### 5. Verificación

```
npx tsc --noEmit
```

## Restricciones

- No corras `prisma migrate deploy` NI `prisma migrate resolve` antes de haber visto el resultado del diff del paso 1 y confirmado que es exactamente lo esperado.
- Si el diff del paso 1 muestra algo inesperado, tu única acción es reportarlo — no intentes resolverlo vos, no adivines, no ejecutes nada más contra prod.
- No toques `_prisma_migrations` a mano con SQL directo — usá siempre `prisma migrate resolve`, que es la vía soportada.

## Al terminar

Reportá: el output completo del diff del paso 1 (aunque haya sido vacío — decilo explícitamente), confirmación de los 14 `resolve --applied`, output de `migrate deploy` (solo la 1 nueva), resumen del backfill, y `tsc` limpio. Si algo no matchea lo esperado en cualquier paso, parate ahí y contá qué viste.
