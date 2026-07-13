import { describe, it, expect } from 'vitest'
import { parseBacklog } from './sync.js'

// Regresión del bug 2026-07-08: una fila de BACKLOG.md con una celda "|" de más
// (Descripción/Estado/Ejecutor mal cerrados a mano) desalinea el split('|') y
// termina subiendo el Ejecutor equivocado a orch_backlog en silencio — sin este
// test, el único aviso era el dashboard mostrando datos corridos.
//
// parseBacklog ahora loguea un warning y SALTEA cualquier fila que no tenga
// exactamente 7 celdas (ID|P|Descripción|Estado|Ejecutor + bordes vacíos del split).
// Este test corre contra el system/BACKLOG.md real: si alguien (agente o humano)
// rompe una fila a mano, `npm test` falla acá antes de que el sync suba nada mal.

describe('parseBacklog — integridad de system/BACKLOG.md', () => {
  it('no emite warnings de filas malformadas contra el archivo real', () => {
    const warnings: string[] = []
    parseBacklog((msg) => warnings.push(msg))
    expect(warnings).toEqual([])
  })

  it('parsea al menos una fila con item_id, label y ejecutor no vacíos', () => {
    const rows = parseBacklog(() => {}) as { item_id: string; label: string; ejecutor: string }[]
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.item_id).toBeTruthy()
      expect(r.label).toBeTruthy()
      expect(r.ejecutor).toBeTruthy()
    }
  })
})
