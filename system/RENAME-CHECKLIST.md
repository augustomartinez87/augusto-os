# Checklist de Rename & Ordenamiento — Kredy / Spensiv (jun 2026)

> Objetivo: dejar TODO ordenado y con nombres correctos antes de avanzar con features.
> Contexto: Kredy (préstamos) hoy se llama "spensiv" en casi todos lados porque era el repo original.
> Spensiv = el tracker de finanzas personales, recién separado. El branding viejo
> ("Spensiv - tu motor de cashflow personal", tarjetas/gastos) en realidad le corresponde al TRACKER,
> no a Kredy. Kredy necesita branding nuevo de préstamos/crédito.

## Estado actual (referencia — no re-investigar)

**Kredy (préstamos):**
- Repo: github.com/augustomartinez87/spensiv → debería ser `kredy`
- Vercel: project "spensiv" (`prj_mRP0fm4LQlyExYloJ2lpYWPRcmEO`, team `team_Vw7edLX5zwmOqsx49Q7IAai2`), URL `spensiv.vercel.app`
- DB prod: Supabase project "Spensiv" (`jymdblurkpadupdqzfzo`)
- Sandbox del loop: Neon `ep-old-union-aiylgeew` (rol "kredy-dev")
- Carpeta local: `C:\Users\Augusto\Downloads\Proyectos\spensiv`
- Rutas vivas con usuarios externos: `/l/[slug]`, `/simular`, `/ap`

**Spensiv (finanzas personales):**
- Repo: github.com/augustomartinez87/spensiv-tracker
- Vercel: project recién importado (`spensiv-tracker.vercel.app`)
- DB prod: Neon `ep-floral-mud-adt2iqe9` (datos restaurados del backup)
- Carpeta local: `C:\Users\Augusto\Downloads\Proyectos\spensiv-tracker`
- Clerk: reusa el `pk_test` de Kredy (mismo login)

**Argos:** repo `portfolio-tracker`, Supabase `wwzocpcolgdzkvcigchj`.
**Sistema:** `augusto-os` (orquestador + memoria).

## Progreso (2026-06-20)

Hecho en augusto-os (config, no destructivo): **G** (targets.json, .env, prod-db-hosts, executor/planner target-aware, frontmatter F-0001/0002), **C** decidido (renombrar Vercel + reenviar links), **A** specs listos para el loop (`features/F-0003.md` Kredy, `features/F-0004.md` tracker). Ver `system/DECISIONS.md` (entrada 2026-06-20) y `system/HANDOFF-RENAME.md` para los pasos manuales (B/C/D/E/F), el backup (H) y los comandos de loop.

Pendiente (manos de Augusto / fuera del sandbox): B GitHub, C Vercel, D Supabase, E Neon, F carpetas, H backup + sync kredy-dev, correr loops F-0003/F-0004, review SP-008.

## Tareas

### A. Branding / UI
- [x] **Kredy:** rebrand hecho por el loop (F-0003) y **deployado a prod** (`kredy-ap.vercel.app`) el 2026-06-20. metadataBase + siteName + copy = Kredy. ✅
- [~] **Spensiv-tracker:** spec `F-0004.md` listo (target `spensiv`). ⚠️ requiere crear el sandbox dev del tracker antes de correr (guard).

### B. GitHub
- [x] Renombrar repo `spensiv` → `kredy`. ✅ 2026-06-20 (push de F-0003 ya entró a `augustomartinez87/kredy`). Pendiente menor: `git remote set-url origin https://github.com/augustomartinez87/kredy.git` (anda por redirect igual).

### C. Vercel ⚠️ DECISIÓN
- [ ] Renombrar project "spensiv" → "kredy". **OJO:** cambia el subdominio a `kredy.vercel.app` y libera `spensiv.vercel.app` → **rompe los links `/l` que ya hayas mandado a prestatarios**. Antes de hacerlo: confirmar si hay links en circulación. Decidir (a) renombrar + reemitir/redirigir links, o (b) mantener el subdominio. (Augusto eligió quedarse en vercel.app sin dominio propio.)
- [ ] Project del tracker: confirmar nombre = "spensiv".

### D. Supabase
- [ ] Renombrar el display del project "Spensiv" → "Kredy" (cosmético; el ref `jymdblurkpadupdqzfzo` no cambia, no rompe nada).

### E. Neon
- [ ] Renombrar el proyecto Neon de Kredy (`ep-old-union`) → "kredy-dev", y el de Spensiv (`ep-floral-mud`) → "spensiv". Cosmético en el dashboard de Neon.

### F. Carpetas locales ⚠️
- [x] `targets.json` actualizado a paths `kredy` y `spensiv`. ✅ 2026-06-20
- [x] Carpetas renombradas a `kredy` y `spensiv`. ✅ 2026-06-20. **SPLIT COMPLETO.**

### G. Orquestador / augusto-os
- [x] `targets/targets.json`: key `spensiv` → `kredy`; agregado target `spensiv` (el tracker) con path/verify/lint/test. ✅ 2026-06-20
- [x] `orchestrator/.env`: `SPENSIV_DEV_DATABASE_URL` → `KREDY_DEV_DATABASE_URL`; agregado `SPENSIV_DEV_DATABASE_URL=<COMPLETAR>` para el tracker. ✅ 2026-06-20 (backup `.env.bak-rename`)
- [ ] Sincronizar el sandbox `kredy-dev` al schema post-split (todavía tiene tablas del tracker viejas): `cd spensiv && npx prisma db push`. → comando en HANDOFF-RENAME.md
- [x] Actualizar `system/` (DECISIONS.md + este checklist). ✅ 2026-06-20. Pendiente: separar Kredy/Spensiv en el `CLAUDE.md` global (flageado, no auto-editado).
- [x] **Extra:** `executor.ts`/`planner.ts` target-aware; `prodDbPatterns` del tracker (`ep-floral-mud`); frontmatter F-0001/F-0002 → `target: kredy`. ✅ 2026-06-20

### H. Reviews / organización
- [ ] Revisar y mergear (o descartar) **SP-008** — branch `feat/F-0002-ap-score-como-gate-de-pre-aprobaci-n` (gate de AP score, ya construido y testeado por el loop, esperando review).
- [ ] Limpiar los `.md` sueltos del repo de Kredy (`orchestrator-*.md`, `kredy-split-*.md`) → mover a `augusto-os/system/prompts/` o borrar.
- [ ] **Backup de la nueva prod de Spensiv** (Neon `ep-floral-mud`) — hoy NO tiene backup.
- [ ] Verificación final: ambas apps online, login OK, datos OK, y nombres consistentes en los 5 lugares (repo, Vercel, Supabase/Neon, carpeta, branding).

## Recién cuando esto esté ✅ → avanzar con features.
```
Orden sugerido (menos riesgo primero): A → B → D → E → G → H, y dejar C (Vercel) y F (carpetas) para el final con decisión explícita de Augusto.
```
