# Handoff Rename Kredy/Spensiv — pasos manuales (2026-06-20)

Lo que sigue requiere tus credenciales/dashboards o red que el sandbox no alcanza.
Orden recomendado (menos riesgo primero): **H-backup → G-sync → A-loops → B → D → E → C → F**.

---

## H — Backup urgente de la prod del tracker (Neon ep-floral-mud) ⚠️ HOY sin backup

El sandbox no tiene cliente Postgres ni acceso de red a Neon, así que corré esto vos (necesitás `pg_dump`
de PostgreSQL 16 instalado). Usá la **DIRECT_URL** (no pooled):

```bash
cd C:\Users\Augusto\Downloads\Proyectos\spensiv-tracker
mkdir backups 2>NUL
# dump custom-format (recomendado, restaurable con pg_restore):
pg_dump "%DIRECT_URL%" --no-owner --no-privileges -Fc -f backups/spensiv-prod-20260620.dump
# (o plano .sql)  pg_dump "%DIRECT_URL%" --no-owner --no-privileges -f backups/spensiv-prod-20260620.sql
```
`%DIRECT_URL%` está en `spensiv-tracker/.env`. Si la URL no trae `sslmode`, agregá `?sslmode=require`.
Verificá tamaño > 0 y, opcional, `pg_restore -l backups/spensiv-prod-20260620.dump` para listar el contenido.
Repetir/automatizar: vale dejar un scheduled task. Avisame y lo armo.

---

## G (resto) — Re-sincronizar el sandbox kredy-dev al schema post-split

El sandbox `kredy-dev` (Neon ep-old-union) todavía tiene tablas viejas del tracker. El loop NO puede correr
`prisma db push` (gate humano), así que hacelo manual:

```bash
cd C:\Users\Augusto\Downloads\Proyectos\spensiv
set DATABASE_URL=%KREDY_DEV_DATABASE_URL%   # la URL directa de Neon kredy-dev (de orchestrator/.env)
set DIRECT_URL=%KREDY_DEV_DATABASE_URL%
npx prisma db push
```
(Para el tracker: crear un Neon dev nuevo, pegar la URL en `orchestrator/.env` como `SPENSIV_DEV_DATABASE_URL`,
y `cd spensiv-tracker && npx prisma db push`. Sin esto, el guard aborta el loop del target `spensiv`.)

---

## A — Correr los loops de branding

Ya están los specs. Desde `orchestrator/`:

```bash
cd C:\Users\Augusto\Downloads\Proyectos\augusto-os\orchestrator
npm start F-0003     # rebrand Kredy (target kredy) — corre sobre kredy-dev
# tras crear el sandbox dev del tracker:
npm start F-0004     # confirmar branding Spensiv (target spensiv)
```
Si un step queda en gate humano: `npm run approve`. Revisá el PR/branch que genera antes de mergear a main.

---

## B — GitHub: renombrar repo spensiv → kredy

1. github.com/augustomartinez87/spensiv → Settings → Repository name → `kredy` → Rename (GitHub deja redirect del viejo).
2. Actualizar el remoto local:
```bash
cd C:\Users\Augusto\Downloads\Proyectos\spensiv
git remote set-url origin https://github.com/augustomartinez87/kredy.git
git remote -v   # verificar
```
(El repo del tracker ya es `spensiv-tracker`, no se toca.)

---

## C — Vercel: renombrar project spensiv → kredy  (DECIDIDO: renombrar + reenviar links)

1. Vercel → project `spensiv` (`prj_mRP0fm4LQlyExYloJ2lpYWPRcmEO`) → Settings → General → Project Name → `kredy`.
   El subdominio pasa a `kredy.vercel.app` y se libera `spensiv.vercel.app`.
2. **Reenviar/regenerar** los links `/l/[slug]` que mandaste a prestatarios (apuntaban a `spensiv.vercel.app`).
3. Confirmar que el project del tracker se llama `spensiv` (`spensiv-tracker.vercel.app`).
4. `metadataBase` de Kredy ya queda en `https://kredy.vercel.app` vía F-0003.

> Si todavía hay links `/l` activos sin reenviar, hacé el rename recién cuando puedas reemitirlos, para no romperlos en el medio.

---

## D — Supabase: renombrar display "Spensiv" → "Kredy"  (cosmético)

Dashboard Supabase → project `jymdblurkpadupdqzfzo` → Settings → General → Project name → `Kredy`.
El ref `jymdblurkpadupdqzfzo` NO cambia, no rompe nada.

---

## E — Neon: renombrar proyectos  (cosmético)

- `ep-old-union-aiylgeew` → "kredy-dev".
- `ep-floral-mud-adt2iqe9` → "spensiv".
Solo display en el dashboard de Neon; los endpoint IDs no cambian.

---

## F — Carpetas locales (AL FINAL, coordinado) ⚠️

Rompe paths del orquestador y el mount de Cowork. Hacelo cuando no haya un loop corriendo:

1. Renombrar `spensiv` → `kredy` y `spensiv-tracker` → `spensiv`.
2. En `targets/targets.json` actualizar los `path`:
   - target `kredy`.path → `C:/Users/Augusto/Downloads/Proyectos/kredy`
   - target `spensiv`.path → `C:/Users/Augusto/Downloads/Proyectos/spensiv`
3. Reabrir/re-montar la carpeta en Cowork si hace falta.

---

## SP-008 — Review/merge del gate de AP score (F-0002)

Branch `feat/F-0002-ap-score-como-gate-de-pre-aprobaci-n` (steps 1-3 done; verificar step 4 = test del gate).
```bash
cd C:\Users\Augusto\Downloads\Proyectos\spensiv
git checkout feat/F-0002-ap-score-como-gate-de-pre-aprobaci-n
git diff main --stat
npx tsc --noEmit && npm run lint && npm run test
```
Si pasa y el test del gate (score bajo→hard bloquea / soft flaggea / null→pasa) está presente, mergear a main.

## Limpieza de .md sueltos en el repo de Kredy (checklist H)

En `spensiv/` hay sueltos: `orchestrator-*.md`, `kredy-split-*.md`, `kredy-spensiv-split-plan.md`,
`spensiv-prompt-sonnet-*.md`, `spensiv-spec-*.md`. Mover a `augusto-os/system/prompts/` o borrar.
