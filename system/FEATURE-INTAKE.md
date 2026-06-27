# Feature Intake — cómo convertir una idea en un `.md` que el loop pueda ejecutar bien

> Objetivo: que ningún `.md` sea hueco. Antes de escribir el spec, se responde este
> cuestionario. Cada respuesta mapea a un campo de `features/_TEMPLATE.md`.
> Hoy hace de "intake" Claude (este chat). A futuro lo hace el **Architect agent** de augusto-os (S-008).

## Las 9 preguntas del intake

1. **Problema y usuario.** ¿Qué dolor concreto resuelve y para quién (prestatario, AP, vos como operador)?
   → alimenta *Contexto*.
2. **Éxito observable.** ¿Cómo sé que quedó bien? Listá señales verificables, no deseos vagos.
   → alimenta *acceptance*.
3. **Alcance mínimo (MVP).** ¿Cuál es la versión más chica que aporta valor? (filosofía: simplicidad > bloat)
   → alimenta *Pasos sugeridos*.
4. **Fuera de alcance.** ¿Qué dejamos afuera a propósito en esta iteración?
   → alimenta *Fuera de alcance*.
5. **Target.** ¿`kredy`, `spensiv` o `argos`?
   → frontmatter *target*.
6. **¿Toca UI?** Si hay pantallas nuevas/cambiadas → `ui: true` (dispara QA visual).
   → frontmatter *ui*.
7. **¿Toca DB/schema?** Si necesita migración → es **gate humano**; preferí diseñar el cambio
   SIN migración (ej. usar JSON de config existente) para que el loop lo corra solo.
   → *Restricciones* + decide si hace falta tu OK de migración.
8. **¿Toca prod/dinero/legal?** Deploy, push a main, mutuo/pagaré, trades/transferencias → **gate humano**.
   → *Restricciones*.
9. **Reglas de dominio y qué NO romper.** Ej.: nunca TNA/tasa a prestatario; camelCase sin @map;
   motor P&L canónico; dependencias con otras features.
   → *Restricciones* + *Contexto*.

## Definition of Ready (un spec está listo cuando…)

- Tiene `target`, `ui`, y al menos 2 criterios de aceptación **observables**.
- El alcance mínimo está claro y hay un *Fuera de alcance* explícito.
- Está declarado si toca DB/prod/legal (y por ende si hay gate humano).
- Nombra lo que ya existe en el repo a reusar (para que el loop no reinvente).

## Flujo

1. Tirás la idea (una línea alcanza).
2. Intake: se responden las 9 preguntas (te las hago yo / el Architect agent).
3. Se escribe `features/F-XXXX.md` desde `_TEMPLATE.md`.
4. Opcional: se agrega al BACKLOG/ROADMAP.
5. `npm start F-XXXX` → el loop ejecuta hasta el gate de release.

- [2026-06-25T18:02:52.905Z] (telegram) Hola
- [2026-06-25T18:11:03.053Z] (telegram) agregar un export csv para spensiv?
- [2026-06-25T18:15:29.880Z] (telegram) argos comparar contra Rendi finance a ver que ideas podemos robar
- [2026-06-25T18:19:59.449Z] (telegram) comparar argos contra tracker también, hay cosas por mejorar
- [2026-06-26T03:57:11.717557+00:00] (web) mejorar visualmente el dashboard...
- [2026-06-26T18:08:55.033391+00:00] (web) robar ideas de https://vestyapp.io/ para argos
- [2026-06-26T03:57:11.717557+00:00] (web) mejorar visualmente el dashboard...
- [2026-06-26T18:08:55.033391+00:00] (web) robar ideas de https://vestyapp.io/ para argos