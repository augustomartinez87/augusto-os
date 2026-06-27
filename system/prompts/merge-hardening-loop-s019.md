Mergeá la branch `hardening/loop-s019` a `main` en el repo `augusto-os`.

Contexto: es trabajo de hardening del propio orchestrator (S-019, S-021, S-020, S-017), ya commiteado en esa branch (1 commit adelante de main, sha 609eb5d) pero sin pushear, a la espera de mi revisión. Ya revisé el código (state.ts, git.ts, index.ts, adr.ts) y está correcto.

Pasos:
1. `git status` y `git log main..hardening/loop-s019 --oneline` para confirmar qué se va a mergear. Mostrame la lista de archivos cambiados (`git diff main..hardening/loop-s019 --stat`).
2. Si hay cambios sin commitear en el working tree (ej. F-0006.md, FEATURE-INTAKE.md, MODEL-ROUTING.md) que NO son parte de este hardening, NO los toques ni los incluyas en el merge — son trabajo aparte.
3. `git checkout main`
4. `git merge --no-ff hardening/loop-s019 -m "merge: hardening/loop-s019 (S-019, S-021, S-020, S-017)"`
5. Si hay conflictos: parate, no los resuelvas automáticamente, avisame qué archivos conflictúan.
6. Si el merge es limpio: correr `npm run typecheck` y `npm test` (o el script equivalente del orchestrator) para confirmar que main queda verde post-merge.
7. NO hagas `git push`. Dejá el merge local en main, sin pushear — el push lo hago yo manualmente.
8. Al final, mostrame `git log main -3 --oneline` y el resultado de typecheck/tests.

No se requiere aprobación adicional para este merge local (ya está revisado); solo el push queda como acción mía.
