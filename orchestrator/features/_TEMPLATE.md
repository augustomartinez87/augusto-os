---
id: F-XXXX                # siguiente número libre
title: <título corto y accionable>
target: kredy             # kredy | spensiv | argos
ui: false                 # true si toca pantallas que requieren QA visual
acceptance:               # criterios OBSERVABLES (se pueden verificar sí/no)
  - <criterio 1, concreto y testeable>
  - <criterio 2>
  - Typecheck, lint y tests pasan sin errores
---

## Contexto

<Qué problema resuelve y para quién. Qué ya existe en el repo que el loop debe REUSAR
(archivos, helpers, patrones) para no reinventar. Si hay un patrón análogo a copiar, nómbralo
con su ruta/línea.>

## Pasos sugeridos (el planner puede refinar)

1. <paso atómico, implementable y que typechee solo>
2. ...

## Fuera de alcance

- <lo que explícitamente NO se hace en esta feature — evita el feature bloat>

## Restricciones clave

- <reglas de dominio innegociables: ej. nunca mostrar TNA/tasa a prestatario;
  sin migración de schema; columnas camelCase sin @map; etc.>
