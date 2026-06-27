Mergeá la branch `feature/s008-intake-architect` a `main` en el repo `augusto-os`.

Contexto: S-008 (Intake barato + Architect agent), ya revisado y aprobado — código verificado línea por línea contra el spec original, 126 tests reportados en verde, typecheck limpio. Las dos decisiones de diseño abiertas (marcador `<!-- procesado -->` y prioridad arquitectura-sobre-bug en `classify`) ya quedaron registradas como ADR-0028 y ADR-0029 en `system/DECISIONS.md`.

Pasos:
1. `git log main..feature/s008-intake-architect --oneline` y `git diff main..feature/s008-intake-architect --stat` para confirmar qué se va a mergear.
2. `git checkout main`
3. `git merge --no-ff feature/s008-intake-architect -m "merge: feature/s008-intake-architect (S-008 intake + architect agent)"`
4. Si hay conflictos: parate, no los resuelvas solo, avisame qué archivos conflictúan.
5. Si el merge es limpio: correr typecheck y la suite de tests completa del orchestrator para confirmar que main queda verde post-merge.
6. NO hagas `git push`. Dejá el merge local en main — el push lo hago yo manualmente.
7. Mostrame `git log main -3 --oneline` y el resultado de typecheck/tests.
