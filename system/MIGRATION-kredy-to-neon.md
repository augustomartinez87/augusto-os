# Runbook — Migrar Kredy prod: Supabase → Neon

> **Ejecuta Augusto.** Toca la DB de producción de Kredy (dinero real: préstamos, pagarés, comisiones AP).
> El sandbox no tiene red ni credenciales a estas DBs. Backlog: **S-010** (estado `waiting` hasta tu OK paso a paso).
> Decisión de fondo: ver ADR (próximo) — Kredy usa Prisma + Clerk, así que Supabase le funciona solo como Postgres;
> Neon hace ese trabajo mejor en free tier (no se pausa, branching) y unifica todo lo Prisma en un proveedor.

## Estado de origen y destino

- **Origen (prod actual):** Supabase `jymdblurkpadupdqzfzo` → `db.jymdblurkpadupdqzfzo.supabase.co`. ~341 MB, **sin backups automáticos**.
- **Destino (prod nuevo):** un proyecto **Neon nuevo** llamado `kredy` (NO reusar `kredy-dev`, que es el sandbox del loop).
- **Auth:** Clerk (externo). **No se migra nada de auth** — Clerk no vive en la DB.
- **Dev del loop:** sigue siendo Neon `kredy-dev`. No se toca acá.

---

## Orden (cada paso con verificación antes de avanzar)

### 0. Backup fresco de la prod actual (red de seguridad) ⚠️ primero
```bash
cd C:\Users\Augusto\Downloads\Proyectos\kredy
# DIRECT_URL = conexión directa a la prod Supabase (de kredy/.env). Si no trae sslmode, agregá ?sslmode=require
pg_dump "%SUPABASE_DIRECT_URL%" --no-owner --no-privileges -n public -Fc -f backups/kredy-prod-pre-neon.dump
```
Verificá tamaño > 0 y `pg_restore -l backups/kredy-prod-pre-neon.dump` lista las tablas de Kredy.
Nota: `-n public` dumpea **solo el schema public** (las tablas de Prisma). Los schemas `auth`/`storage` de Supabase NO se migran (no se usan: auth es Clerk).

### 1. Crear el proyecto Neon `kredy` (prod)
En console.neon.tech → New Project → nombre `kredy`, región **us-east-1** (igual que los otros, baja latencia entre ellos).
Anotá las dos URLs:
- **pooled** (`...-pooler...`) → irá en `DATABASE_URL`
- **direct** (sin `-pooler`) → irá en `DIRECT_URL`

### 2. Materializar el schema en Neon `kredy`
Con Prisma (limpio, evita arrastrar objetos Supabase-específicos):
```bash
cd C:\Users\Augusto\Downloads\Proyectos\kredy
set DATABASE_URL=<neon kredy DIRECT_URL>
set DIRECT_URL=<neon kredy DIRECT_URL>
npx prisma db push          # crea las tablas desde prisma/schema.prisma
```
Si el schema usa extensiones (`uuid-ossp`, `pgcrypto`, `citext`): verificá que Prisma las declare (`previewFeatures`/`extensions`) o creálas a mano en Neon (`CREATE EXTENSION IF NOT EXISTS ...`) antes del push.

### 3. Cargar los datos (data-only) desde el dump
```bash
cd C:\Users\Augusto\Downloads\Proyectos\kredy
# restore SOLO datos (el schema ya lo creó Prisma en el paso 2):
pg_restore --data-only --disable-triggers --no-owner -d "<neon kredy DIRECT_URL>" backups/kredy-prod-pre-neon.dump
```
Si hay choque de orden por FKs, `--disable-triggers` lo resuelve. Alternativa si preferís todo de una: saltear el paso 2 y hacer `pg_restore` completo (schema+data) — pero el camino Prisma-first es más limpio.

### 4. Verificar paridad de datos (antes de cambiar nada en prod)
Comparar conteos clave origen vs destino. Corré en ambas DBs y que coincidan:
```sql
SELECT 'loans', count(*) FROM "Loan"
UNION ALL SELECT 'payments', count(*) FROM "Payment"
UNION ALL SELECT 'aps', count(*) FROM "Agent"          -- ajustá a tus nombres reales de tabla
UNION ALL SELECT 'commissions', count(*) FROM "Commission";
```
También chequeá los **sequences** (que el próximo id no choque): si Prisma usa autoincrement, `pg_restore` con `--data-only` puede no setear los sequences → corré `SELECT setval(...)` o un `prisma db push` no ayuda acá; usá un script de resync de sequences si los conteos están OK pero los inserts nuevos fallan por PK duplicada.

### 5. Cortar tráfico → cambiar las connection strings
> Hacelo en una ventana de baja actividad. Idealmente pausá originación unos minutos.
1. **Vercel** (project `kredy-ap`) → Settings → Environment Variables: reemplazá `DATABASE_URL` (pooled, agregá `?pgbouncer=true&connection_limit=1`) y `DIRECT_URL` (direct) por las de Neon `kredy`.
2. **Local** `kredy/.env`: mismas dos URLs (para tu uso manual).
3. **Redeploy** en Vercel para tomar las env nuevas.

### 6. Smoke test en prod (Neon)
- Login con Clerk OK (auth no debería verse afectada — es externa).
- Abrir `/ap`: el score y los datos del AP cargan.
- Abrir un préstamo existente: cuotas y montos correctos.
- Crear un movimiento de prueba reversible (o en staging) y confirmar que escribe en Neon.
- Revisar logs de Vercel: cero errores de conexión Prisma.

### 7. Actualizar el guard del orquestador
En `augusto-os/`:
- `targets/targets.json` → target `kredy` → `prodDbPatterns`: **agregar el host de Neon `kredy` prod** (ej. `ep-xxxx-prod`) para que el loop nunca lo use como dev. **No borres** `jymdblurkpadupdqzfzo` todavía (hasta retirar Supabase).
- Confirmar que `kredy-dev` (Neon dev) sigue siendo un host **distinto** del nuevo prod, si no el guard lo bloquea con razón.
- Commit en augusto-os documentando el cambio.

### 8. Retiro de Supabase (después de N días estable)
- Dejá el proyecto Supabase `jymdblurkpadupdqzfzo` **pausado** como fallback 1–2 semanas.
- Confirmado todo OK → exportá un último dump por las dudas y eliminá el proyecto Supabase.
- Recién ahí sacá `jymdblurkpadupdqzfzo` de `prodDbPatterns`.

---

## Riesgos / checklist de "no romper"
- **Sequences/PKs:** el riesgo #1 de un `--data-only`. Verificá el paso 4 antes de habilitar escritura.
- **Extensiones:** si Supabase tenía `uuid-ossp`/`pgcrypto` y Neon no, los defaults de columnas fallan. Crealas antes del restore.
- **Pooled vs direct:** Prisma necesita `DIRECT_URL` (direct) para migraciones y `DATABASE_URL` (pooled, `pgbouncer=true`) para runtime. No los cruces.
- **RLS:** si Kredy no usaba RLS de Supabase (con Clerk + Prisma normalmente no), no hay nada que migrar. Si usaba, replicá las policies o confirmá que la lógica de acceso está en la app.
- **Backup primero, siempre.** El paso 0 es no negociable.

## Backup automático (independiente de esta migración)
Mientras tanto, Kredy prod no tiene backup automático. Puedo agendarte un `pg_dump` diario (scheduled task) apuntando a la prod actual o a Neon post-migración. Avisá y lo armo.
