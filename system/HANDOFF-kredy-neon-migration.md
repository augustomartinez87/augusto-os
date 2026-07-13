> **ACTUALIZACIÓN 2026-07-08 (misma sesión):** el corte de tráfico (paso 5) ya se ejecutó — `DATABASE_URL`
> de `kredy-ap` en Vercel apunta a Neon (All Environments) y el redeploy + smoke test salieron OK.
> Detalle en `system/PROGRESS.md`, entrada S-010 "corte de tráfico (pasos 5-7)". Este handoff queda
> como registro histórico de cómo se preparó el corte; lo único que sigue pendiente es el **paso 8
> (retirar Supabase)**, recién después de unos días estables en Neon.

# Handoff — Migración Kredy Supabase→Neon, corte de tráfico pendiente (2026-07-08)

> Punto de entrada para retomar esto en una sesión nueva de Cowork. La migración de datos está
> **100% cerrada y verificada** — lo único que falta es el corte de tráfico en Vercel + smoke test.
> Detalle completo de todo el proceso en `system/PROGRESS.md` (buscar las 3 entradas "S-010" con
> fecha 2026-07-08). Runbook original en `system/MIGRATION-kredy-to-neon.md` (pasos 5-8 son los que
> faltan; 0-4 ya están hechos y este handoff los da por completados).

## Estado exacto ahora mismo

- Neon `kredy` (prod) tiene el schema completo + los datos restaurados, **verificados 1:1 contra
  Supabase en las 28 tablas reales** (última verificación, misma sesión): agent_configs=3, alerts=0,
  ap_commissions=27, ap_ledger_events=0, ap_links=3, ap_score_configs=1, ap_score_snapshots=6,
  ap_settlements=0, ap_withdrawals=0, borrower_types=4, consulta_360_cache=55, consultas_360=28,
  contacts=28, duration_adjustments=12, loan_accruals_monthly=201, loan_activity_logs=15,
  loan_attachments=0, loan_installments=192, loan_payments=65, loan_real_cashflows=148, loans=37,
  opportunities=27, opportunity_events=57, persons=18, pre_approvals=1, public_simulator_configs=1,
  risk_configs=0, users=4.
- **Vercel `kredy-ap` todavía apunta 100% a Supabase — no se tocó nada de producción todavía.** La
  app sigue funcionando exactamente igual que antes de empezar esta migración. Este es el estado
  seguro desde el que se retoma; no hay nada a medio cortar.

## Lo que falta

1. **Cortar tráfico (paso 5 del runbook).**
   - **Antes de tocar nada:** copiar/guardar el valor ACTUAL de `DATABASE_URL` en Vercel (`kredy-ap`
     → Settings → Environment Variables → Production) en algún lado seguro — es el string de
     Supabase, necesario para poder revertir si algo sale mal (Vercel no expone historial de
     valores editados de una env var).
   - Editar `DATABASE_URL` (Production) al **pooled** de Neon:
     `postgresql://neondb_owner:npg_HWj75PmrhGJl@ep-patient-art-atxooul0-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`
   - `DIRECT_URL` en Vercel **no hace falta tocarlo ni agregarlo** — confirmado leyendo
     `kredy/prisma/schema.prisma`: el runtime de la app (`PrismaClient` en producción) solo usa
     `DATABASE_URL`; `directUrl` es exclusivo de comandos de Prisma CLI (`migrate`/`db push`), que
     corren local, nunca en el runtime de Vercel.
   - Redeploy: Deployments → el deployment de producción actual → `...` → Redeploy.
2. **Smoke test (paso 6).** Login con Clerk, `/ap` carga score y datos del AP, abrir un préstamo
   existente (cuotas/montos correctos), revisar logs de Vercel sin errores de conexión Prisma.
3. **Actualizar el guard del orquestador (paso 7).** Agregar el host de Neon
   (`ep-patient-art-atxooul0.c-9.us-east-1.aws.neon.tech`, con y sin `-pooler`) a `prodDbPatterns`
   de `kredy` en `augusto-os/targets/targets.json`. NO borrar todavía el patrón de Supabase
   (`jymdblurkpadupdqzfzo`).
4. **Retirar Supabase (paso 8).** Recién después de unos días estables en Neon. Dump final +
   pausar/eliminar el proyecto Supabase. Ahí sí sacar el patrón viejo de `targets.json`.

## Conexiones necesarias en la sesión nueva

- Conectar carpeta `C:\Users\Augusto\Downloads\Proyectos\kredy` (para `schema.prisma`,
  `drop-fks.sql`, `backups/`).
- Conectar carpeta `C:\Users\Augusto\Downloads\Proyectos\augusto-os` (para leer/actualizar
  `system/`).
- El conector MCP de Supabase (proyecto `jymdblurkpadupdqzfzo`) ya viene disponible y da acceso de
  solo lectura — útil para verificar datos sin pedirle a Augusto que corra SQL a mano. No hay
  conector de Neon: todo lo de Neon se hace vía la terminal de Augusto (`psql`/`pg_dump`/
  `pg_restore`/`prisma`), copiando/pegando comandos y salidas.

## Credenciales de esta migración

Ya quedaron expuestas en el chat de la sesión anterior (Augusto decidió no rotarlas todavía, es su
decisión, respetarla — no insistir de nuevo salvo que él lo traiga).

- Neon `kredy` prod — **direct** (sin `-pooler`, para `prisma db push`/migraciones):
  `postgresql://neondb_owner:npg_HWj75PmrhGJl@ep-patient-art-atxooul0.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`
- Neon `kredy` prod — **pooled** (con `-pooler`, para `DATABASE_URL` de runtime/Vercel): mismo
  string con `-pooler` agregado al host (`ep-patient-art-atxooul0-pooler...`).
- Supabase `kredy` prod — Session Pooler (para `pg_dump` del lado origen, si hace falta un dump
  más):
  `postgresql://postgres.jymdblurkpadupdqzfzo:dQXMT31JWgCW1Yqd@aws-0-us-west-2.pooler.supabase.com:5432/postgres`

## Gotchas de Windows aprendidos en esta migración (para no repetir la fricción)

- Las variables de entorno (`set VAR=...`) **no persisten entre ventanas de cmd nuevas** — hay que
  re-setearlas en cada terminal nueva antes de cualquier comando que las use.
- Los connection strings con `&` (Neon los tiene por `channel_binding=require`) rompen `cmd` si no
  van entre comillas: usar `set "VAR=valor"` (con comillas rodeando todo, incluido el nombre de la
  variable), nunca `set VAR=valor` a secas.
- `pg_dump`/`pg_restore`/`psql` viven en `C:\Program Files\PostgreSQL\17\bin` — si no se reconocen,
  correr `set PATH=%PATH%;C:\Program Files\PostgreSQL\17\bin` en esa terminal puntual.
- Neon fuerza IPv6 para la conexión "directa" real; sin IPv6 local hay que usar el **Session
  Pooler** de Supabase (puerto 5432, no 6543) para el `pg_dump` del lado origen — funciona igual de
  bien para este propósito.
- `--disable-triggers` de `pg_restore` **no funciona en Neon** (no hay superusuario). La estrategia
  que sí funcionó: dropear los FK constraints a mano (`kredy/drop-fks.sql`, ya corregido y listo
  para reusar tal cual si hace falta otro resync), `TRUNCATE` de las 28 tablas antes de restaurar,
  `pg_restore --data-only --no-owner`, y recrear los FKs al final con `prisma db push` (que de paso
  valida integridad referencial de todo lo restaurado, sin errores en la última corrida).

## Drift de schema encontrado y ya corregido

`ap_commissions` en prod tenía 6 columnas que faltaban en `schema.prisma` (`rateSnapshot`
numeric(8,6), `consolidatedAmount` numeric(12,2), `estimatedAt`/`consolidatedAt`/`releasedAt`/
`paidAt` timestamp) — ya agregadas al schema con comentario de procedencia y pusheadas a Neon.
`ap_commissions.loanId` ya no es una relación FK real en el schema actual (quedó como
`String @unique` suelto, sin `@relation`) — no bloqueante, dato para si se retoma esa relación a
futuro.
