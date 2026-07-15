# Kredy — Prompt para Sonnet: botón "recordar cobro" vía WhatsApp (SP-014)

> Prompt para Claude Code. Ejecutor: Sonnet. Repo: kredy (Next.js/tRPC/Prisma/Clerk/Tailwind).
> Cargá el skill `spensiv-context` antes de tocar nada (nombre legado de la carpeta del skill —
> sigue siendo el correcto para este repo, Kredy es el ex-Spensiv renombrado 2026-06-20). Autorizado
> a commitear y pushear a main para el endpoint + UI (parte 2 y 3). La migración de schema (parte 1)
> se genera pero **NO se aplica** — ver guardrails.
>
> **Corrección de contexto vs. un borrador previo de este mismo prompt (encontrado sin ejecutar en
> la raíz del repo, con datos viejos):** el repo ya NO usa Supabase — prod es **Neon**
> (`ep-patient-art-atxooul0`, ver `targets/targets.json` de augusto-os), migrado 2026-07-08/13
> (S-010). Dev sandbox = Neon `kredy-dev`. Si ves cualquier referencia a un proyecto Supabase
> `jymdblurkpadupdqzfzo` en código o docs viejos, es el proyecto anterior — ya no existe, no lo uses
> como referencia.
>
> **Objetivo del sprint.** Reducir la fricción de cobro: un botón para que el **AP dueño del
> préstamo** (o Augusto, en préstamos orgánicos sin AP) le mande a cada prestatario un recordatorio
> de la cuota que tiene que girarle, sin salir de Kredy y sin API de mensajería (cero costo de infra).
>
> **Decisión de arquitectura (no la rediscutas):** el canal es **`wa.me` deep-links**, no WhatsApp
> Business API ni Twilio. Kredy solo **arma y abre/copia** el mensaje pre-cargado; el envío lo
> dispara el cliente de WhatsApp de quien hace click (el AP o Augusto, según de quién sea el
> préstamo). Versión 1 = links per-deudor + acción "abrir/copiar todos". Nada de envío server-side.
>
> **Guardrails (no romper):**
> - **La TNA/tasa NUNCA aparece en el mensaje al deudor.** Solo monto de cuota, vencimiento y medio
>   de pago. Regla dura del proyecto (ver CLAUDE.md global).
> - Migración de schema en prod → **generá el `.sql`, NO lo apliques.** OK explícito de Augusto antes.
> - **Scoping por AP:** cada AP solo ve/recuerda a sus propios deudores (`userId` del préstamo), igual
>   que el resto de la app — no expongas la cartera de un AP a otro. Si la vista vive en una zona
>   compartida del dashboard, filtrá por el AP logueado; no la pongas en una pantalla global sin
>   ese filtro.
> - Cero métricas inline: cuotas/vencimientos vía el motor de amortización existente, no recalculadas
>   ad-hoc en el componente.
> - Todo termina con criterios de verificación.

Son tres partes. Hacelas en este orden.

---

## 1. Resolver la fuente del teléfono del deudor (dependencia bloqueante)

Hoy **`Person` no tiene teléfono**; el único `phone` (E.164) vive en `Contact` del lado CRM/AP, y
no todo préstamo activo tiene un `Contact` vinculado. Sin teléfono no hay `wa.me`. Resolver así:

- Agregar **`phone String?`** (E.164 normalizado, ej. `5491126369767`) a `Person`. Migración nueva →
  **generá el `.sql` y pedí OK, no lo apliques.** Normalizá con un helper reutilizable
  (`lib/identity/phone.ts` → `normalizePhone`: limpia espacios/guiones/`+`, valida prefijo país,
  default Argentina `54` si viene sin código). Soft-validación: guardá solo si normaliza OK.
- **Backfill** (script en `scripts/`, idempotente, NO en la migración): para cada `Person` sin
  `phone`, si existe un `Contact` propio con `phone`, copialo. Reportá cuántas personas quedan con
  teléfono y cuántas sin.
- En la UI de cobro (parte 2), las personas **sin teléfono** se muestran con un input inline para
  cargarlo en el momento (mutación `persons.setPhone`), de modo que el flujo no se bloquee por data
  faltante.

**Verificación:** `SELECT count(*) FROM persons WHERE phone IS NOT NULL;` tras backfill; el número
coincide con la cantidad de personas que tenían `Contact` con teléfono. `normalizePhone` con tests
unitarios (entradas con `+54 9 11 ...`, `011 ...`, `11...`, basura → null).

## 2. Endpoint + datos de "quién me debe esta semana"

Nuevo procedure en `loans` (o `portfolio`) — `getCollectionReminders` (protected, scoped al AP
logueado vía `userId` de sesión) — que devuelve, para los préstamos **activos** de ESE `userId`, la
**próxima cuota impaga** de cada deudor:

- Por cada `Person` con préstamo activo (del AP logueado): `personId`, `name`, `phone`, y la
  `LoanInstallment` impaga más próxima (`isPaid = false`, menor `dueDate`): `number`, `dueDate`,
  `amount`, y `loanId`. Si tiene cuotas vencidas (`dueDate < hoy` impagas), marcá `overdue: true` y
  cuántas.
- Filtros de entrada: `dueWithinDays` (default 7, "cuotas que vencen en la próxima semana") y
  `includeOverdue` (default true).
- **Medio de pago de cobro** (alias/CBU al que el deudor debe girar): es **por AP, no fijo de
  Augusto**. El deudor le transfiere al AP que cobra ese préstamo, así que el mensaje usa el alias
  del **AP dueño del préstamo** (el `userId` logueado), con **fallback al de Augusto** para préstamos
  orgánicos (sin AP / config `isSelf`). Agregá `collectionAlias String?` a `AgentConfig` y resolvé el
  alias por el AP del loan. NO hardcodear. Misma migración que la parte 1, mismo OK pendiente.
- Reusá el motor de cuotas/vencimientos existente; no recalcules amortización inline.

**Verificación:** el endpoint lista exactamente los deudores con cuota impaga dentro del rango,
ordenados por `dueDate` asc (los vencidos primero), y SOLO del `userId` logueado — probá con dos APs
distintos, cada uno con préstamos propios, y confirmá que ninguno ve la cartera del otro. Los montos
coinciden con `LoanInstallment.amount`. Cero préstamos cancelados/saldados en el resultado.

## 3. UI: botón "Recordar cobro" + generación de mensajes `wa.me`

En la vista de cobranzas del AP (sección de cuotas/portfolio — buscá dónde el AP ya ve su cartera
hoy, no crees una pantalla nueva si ya existe una natural para esto):

- **Botón principal "Recordar cobro a todos".** Abre un panel/modal con la lista de
  `getCollectionReminders`: por fila → nombre, monto de cuota, vencimiento, badge "vencida" si
  aplica, y un botón **"Enviar recordatorio"** que abre el `wa.me` de ese deudor.
- **Construcción del link:** `https://wa.me/<phone>?text=<mensaje urlencoded>`. Plantilla del mensaje
  (editable como constante, español neutro, **sin tasa**):
  > Hola {nombre}, te recuerdo la cuota {n} de tu préstamo: **{monto} {moneda}**, vence el {fecha}.
  > Podés transferir a {aliasDeCobro}. ¡Gracias!
  Para cuotas vencidas, variante: "…venció el {fecha}, cuando puedas la regularizás. Gracias."
- **"Abrir/copiar todos":** como `wa.me` no permite multi-destinatario, ofrecé (a) abrir los links
  en secuencia (un click por deudor, para no spammear pestañas) **o** (b) un botón "copiar mensaje"
  por fila. Elegí la opción de menor fricción real; documentá cuál implementaste y por qué.
- Filas **sin teléfono** → input inline (parte 1) en lugar del botón de enviar.
- Mobile-first: que el panel y los botones funcionen bien en mobile (es donde se cobra — los AP
  operan desde el celular). Reusá la lógica desktop, no dupliques estado.

**Verificación:** con data real del sandbox dev, el panel lista los deudores con cuota
próxima/vencida del AP logueado; cada link abre WhatsApp con el mensaje correcto y **sin ninguna
mención de TNA/tasa**; el monto y el alias de cobro en el texto coinciden con los del préstamo y la
config. Capturá un screenshot del panel en mobile y un ejemplo de mensaje generado antes de cerrar.

---

**Notas finales:** la parte 1 (columna `phone` + `collectionAlias`) es la única que toca schema →
generá el `.sql`, **no lo apliques**, pedí OK a Augusto. El resto es endpoint + UI, commiteable y
pusheable a main sin ese gate. Reportá el backfill, los tests de `normalizePhone` y el screenshot del
mensaje generado antes de dar el batch por cerrado. ADR si te desviás de alguna decisión de arriba
(especialmente el scoping por-AP o la opción elegida en "abrir/copiar todos").
