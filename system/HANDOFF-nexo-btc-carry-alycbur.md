# Handoff — Estrategia Nexo/BTC (Elvira) para cerrar brecha caución/FCI en Alycbur

> Contexto de sesión Cowork, 2026-07-13. Pausado para resolver AR-022 (bug de reclasificación
> carry/portfolio en Argos, ya cerrado — ver `system/BACKLOG.md`). Retomar desde acá.

## Objetivo

Augusto quiere llevar la relación caución:FCI de la cartera **Alycbur** (Argos) a 1:1. Hoy la
caución está muy por encima del FCI que la respalda. El plan: usar BTC de la cuenta Nexo de
**Elvira** (su madre) como garantía, sacar USDT prestado, convertirlo a ARS, suscribir FCI con eso
para cerrar la brecha. El excedente de spread positivo se usaría para (a) comprar más activos
bursátiles (subir aforo) o (b) bajar la deuda en Nexo.

## Números validados (post fix AR-022 — confiables)

- **Total Caución (Alycbur):** $32,574,589 ARS
- **Saldo FCI carry (Alycbur):** $8,876,685.67 ARS — incluye Alpha Renta Capital Pesos B, Adcap
  Balanceado III A, Alycbur FCI Abierto Pymes A. Los 3 fondos son legítimamente `tipo='carry'`
  (verificado en base tras cerrar AR-022, no hay desync).
- **Cobertura actual: 27.3%**
- **Déficit para 1:1: $23,697,903.33 ARS**
- MEP usado para convertir a USD: **1,523.3** (fecha 2026-07-13, tabla `mep_history` de Supabase)
  → déficit ≈ **USD 15,556**. **Revalidar el MEP al retomar** — esto cambia día a día.

⚠️ Durante la sesión hubo varias cifras intermedias erróneas (17.8%/$26.9M excluyendo Alpha Renta
por error de lectura mía, 16.8%/$27.1M excluyendo Adcap por mal criterio de clasificación). Ambas
quedaron descartadas. **El número bueno es 27.3% / $23.7M ARS de déficit**, arriba.

## Posición BTC (portfolio "Cripto - Mamá" en Argos)

- **1.56402905 BTC**, costo promedio 52,241.49 USDT/BTC.
- Precio marcado en Argos: 60,000 USDT (dato manual, no en vivo).
- Precio de mercado real al 2026-07-13: **~USD 62,900** (buscar de nuevo al retomar).
- Mandato explícito de Augusto: este BTC es para holdear ~10 años, no tocarlo.
- **No hay ningún préstamo real abierto hoy en Nexo contra este BTC.** Hubo un registro en
  `nexo_loans` (5,000 USDT / 0.1 BTC / 5% APR) que resultó ser dato de test, descartado por
  Augusto — no representa una posición real.

## Cuenta Nexo a usar

- La sesión de Nexo con la que se trabajó es la de **Elvira Galarza** (madre de Augusto) —
  confirmado explícitamente que es la cuenta correcta a usar, con conocimiento del riesgo.
- Nivel de fidelización: **Base** (el más bajo — sin stake de NEXO Token, peor tasa en línea
  clásica).
- **Legislación:** no hay campo explícito en la UI de Nexo. Investigación externa: el criterio real
  es **país de KYC**, no antigüedad de cuenta. Argentina no es EEA/MiCA — opera vía entidad
  registrada localmente ante la CNV (PSAV), separada del esquema MiCA europeo. La hipótesis de
  Augusto ("cuenta >3 años = legislación global") no es el mecanismo correcto, pero la conclusión
  práctica (ambas cuentas, la de Augusto y la de Elvira, caen fuera del esquema MiCA por ser
  KYC Argentina) sigue siendo válida.

## Productos Nexo relevantes

**Zero-interest Credit (ZiC)** — `platform.nexo.com/zicc`
- 0% anual, sin comisiones.
- No es un préstamo simple: elegís monto, garantía (BTC/ETH/SOL/XRP), **fecha de vencimiento** y
  un **rango de precio mín/máx**.
  - Si al vencimiento el precio está **debajo del mínimo** → el crédito se cancela tomando el BTC
    al precio mínimo (perdés el BTC bajo ese piso).
  - Si está **arriba del máximo** → se cancela al precio máximo (ganancia capada).
  - Solo dentro del rango repagás en stablecoins y conservás el BTC intacto.
- Renovable ("un solo toque") pero exige acción activa en cada vencimiento.
- Mínimo 0.1 BTC de garantía para sacar fondos.
- En la cuenta de Elvira: **0 créditos activos**, nunca usado.

**Línea de crédito clásica** ("Pedí un préstamo")
- Tasa variable según nivel de fidelización (Base = peor tasa).
- Riesgo continuo de liquidación por LTV (no por banda de precio, no tiene vencimiento fijo).
- Revolving — se puede repagar parcial en cualquier momento.

## Marco de riesgo armado (con el déficit y precio de ese momento — recalcular al retomar)

Con déficit USD 15,556 y BTC ~USD 62,900:

- **LTV inicial 35% (recomendado):** garantía ≈ USD 44,450 → **0.71 BTC** (~45% de los 1.564 BTC
  de Elvira). Liquidación ≈ USD 26,520 (–58% desde spot). Warning ≈ USD 33,880 (–46%).
- **LTV inicial 41%:** garantía ≈ USD 37,940 → **0.60 BTC** (~39% del total).

Recomendación dada: **ZIC en vez de línea clásica** para este draw nuevo — es gratis (0% vs ~5%
de la clásica) y no tiene riesgo de liquidación continua por LTV (que exige monitoreo activo, algo
que no está pasando hoy). Sugerido: banda ancha ±35% del spot, plazo 6–12 meses, con recordatorio
puesto para la fecha de vencimiento (ahí sí hay que actuar si el precio se movió fuera de rango).

**Riesgos a tener presentes, no resueltos aún:**
- Comprometer 39–45% del BTC de Elvira (que se supone no se toca en 10 años) para tapar una
  brecha de pesos es una porción grande — vale la pena que Augusto lo reafirme explícitamente
  antes de ejecutar, no solo mirar el LTV.
- El ZIC, aunque sin liquidación continua, sí puede forzar una venta de BTC al vencimiento si el
  precio sale de la banda — no elimina el riesgo de perder el BTC, lo mueve a un evento puntual.
- Leg de FX: una vez convertido a ARS y en el FCI, queda expuesto a la devaluación ARS/USD
  independiente del riesgo del lado BTC — son dos apuestas apiladas, no una sola.

## Qué falta decidir al retomar

1. Revalidar MEP y precio BTC en vivo (los de este handoff son del 2026-07-13).
2. Confirmar si el déficit se cubre de una sola vez o fraccionado (se había sugerido empezar con
   una porción chica, ~USD 6,000–8,000, para validar el circuito completo antes de comprometer
   todo el monto).
3. Confirmar ZIC (banda ±35%, plazo 6–12 meses) vs línea clásica.
4. Ejecutar: mover BTC de cold wallet a Nexo, tomar el crédito, convertir a ARS, suscribir FCI.
   Todo esto es acción sobre dinero real — se prepara acá, la ejecuta Augusto.
