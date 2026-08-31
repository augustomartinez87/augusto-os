import { describe, it, expect } from 'vitest'
import { buildRestriccionesAbsolutas } from './executor.js'

const LINEAS_COMUNES = [
  'NO corras "prisma migrate", "prisma db push", ni SQL destructivo.',
  'NO deployés a Vercel.',
  'NO toques main branch ni archivos de mutuo/pagaré.',
  'La TNA/tasa NUNCA debe mostrarse en vistas de prestatario.',
]

const FIXTURE_PRISMA = `RESTRICCIONES ABSOLUTAS:
- NO corras "prisma migrate", "prisma db push", ni SQL destructivo.
- NO deployés a Vercel.
- NO toques main branch ni archivos de mutuo/pagaré.
- La TNA/tasa NUNCA debe mostrarse en vistas de prestatario.
- Columnas en camelCase sin @map en Prisma.
- Para conocer modelos y campos del schema, leé prisma/schema.prisma del repo. NUNCA consultes la DB en vivo (DATABASE_URL apunta a producción directamente).`

describe('buildRestriccionesAbsolutas', () => {
  it("caso 'prisma' — texto idéntico al fixture histórico (byte a byte)", () => {
    expect(buildRestriccionesAbsolutas('prisma')).toBe(FIXTURE_PRISMA)
  })

  it("caso undefined — equivalente a 'prisma' (default histórico)", () => {
    expect(buildRestriccionesAbsolutas(undefined)).toBe(FIXTURE_PRISMA)
  })

  it("caso 'none' — sin menciones a Prisma", () => {
    const result = buildRestriccionesAbsolutas('none')
    expect(result).not.toContain('Prisma')
    expect(result).not.toContain('prisma/schema.prisma')
  })

  it("caso 'none' — contiene restricciones de Supabase", () => {
    const result = buildRestriccionesAbsolutas('none')
    expect(result).toContain('supabase/migrations/')
    expect(result).toContain('NUNCA consultes la DB en vivo')
  })

  it('las cuatro líneas comunes están presentes en todos los casos', () => {
    for (const dbModel of ['prisma', 'none', undefined] as const) {
      const result = buildRestriccionesAbsolutas(dbModel)
      for (const linea of LINEAS_COMUNES) {
        expect(result, `dbModel=${String(dbModel)} debe contener: ${linea}`).toContain(linea)
      }
    }
  })
})
