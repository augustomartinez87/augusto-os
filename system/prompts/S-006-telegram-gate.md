# Prompt para Claude Code — S-006: Aprobación de gates por Telegram

> Pegá este documento en Claude Code (Sonnet) dentro de `augusto-os/orchestrator/`.
> Augusto es Product Owner; salida final = **veredicto en castellano** con tabla PASÓ/FALLÓ.
> Alcance ÚNICO- reemplazar `npm run approve` por aprobar/rechazar desde el celu + un canal para mandar ideas.
> NO construir- dashboard web (S-007), Architect agent (S-008), loops nocturnos (S-004).

## Objetivo

Hoy, cuando el loop necesita aprobación humana (`setHumanGate`), Augusto tiene que ir a la compu y correr `npm run approve`. Queremos que el loop le **avise por Telegram** con botones Aprobar/Rechazar, y que pueda **mandar ideas** al backlog desde el celu. El loop NO corre en la nube- el bot es parte del runner local (token y repos quedan locales).

## Diseño (enganchar la mecánica existente, no reescribirla)

Mecánica de gate actual:
- `src/gates.ts`- `setHumanGate(state, detail)` escribe `state.needsHumanApproval = detail` en STATE.json; `clearHumanGate(state)` lo pone en null.
- `src/index.ts`- el main loop pollea STATE.json cada 60s mientras `needsHumanApproval` esté seteado y reanuda cuando es null. `npm run approve` (= `index.ts --approve`) hace `clearHumanGate`. **El bot solo tiene que limpiar el gate en STATE.json y el loop reanuda solo.**

### 1. `src/telegram.ts` (módulo nuevo)

- `notifyGate(detail: string, featureId: string)`- manda un mensaje al chat de Augusto con el detalle del gate y un inline keyboard con **Aprobar** / **Rechazar** (callback_data que incluya featureId). Usa `TELEGRAM_BOT_TOKEN`. Si no hay token configurado → **no-op silencioso** (degradación- el flujo `npm run approve` sigue funcionando).
- `runTelegramListener()`- long-polling (`getUpdates`) que procesa-
  - callback **Aprobar** → cargar STATE, `clearHumanGate`, guardar (equivalente exacto a `npm run approve`); responder el callback ("Aprobado ✅").
  - callback **Rechazar** → dejar el gate puesto, registrar en `blocked.log`, responder ("Rechazado — queda en pausa"). Mantenerlo simple- no inventar un estado nuevo.
  - mensaje de texto libre (no botón) → appendear a la cola de ideas (`../system/FEATURE-INTAKE.md`, o `../system/IDEAS.md` si preferís separarlo) con timestamp; responder "Idea anotada 📝".
  - **Seguridad- ignorar todo update cuyo from/chat id != `TELEGRAM_CHAT_ID`.**

### 2. Enganche en `src/gates.ts`

- En `setHumanGate`, después de `saveState`, llamar `notifyGate(detail, state.featureId)`. Mantener el `log("npm run approve")` como fallback. La notificación nunca debe romper el loop si Telegram falla (try/catch + log).

### 3. Proceso del bot

- Script nuevo en `package.json`- `"bot": "tsx --env-file=.env src/bot.ts"`, que arranca `runTelegramListener()`. Corre en paralelo a `npm start` (always-on en el runner local).

### 4. Config / secreto

- `.env`- `TELEGRAM_BOT_TOKEN=...` y `TELEGRAM_CHAT_ID=...` (ya gitignored). Documentar en comentario cómo obtenerlos (token vía @BotFather; chat_id vía `getUpdates` tras escribirle al bot).

## Dependencia

- Telegram- usar `node-telegram-bot-api` (simple, polling) o fetch directo a `api.telegram.org`. Preferir el lib por robustez del polling. `npm install`.

## Restricciones

- El bot NO ejecuta código del target ni toca prod- solo lee/limpia el gate en STATE.json y appendea ideas.
- Allowlist estricta por chat_id; sin allowlist configurada, no responde a nadie.
- Degradación total- sin token, todo el sistema sigue andando con `npm run approve`.
- Sin migración de schema; el secreto nunca se commitea.

## Verificación (dejar pasando)

1. `npx tsc --noEmit` limpio; lint; suite existente verde.
2. Tests (mockear la API de Telegram, sin llamadas reales)-
   - parser de callback_data- distingue Aprobar/Rechazar y extrae featureId.
   - allowlist- un update de un chat_id ajeno se ignora.
   - append de idea- un mensaje de texto se escribe en la cola con timestamp.
   - aprobar- `clearHumanGate` deja `needsHumanApproval = null` en STATE.json.
3. Prueba manual documentada (no contra prod)- `setHumanGate` dispara un mensaje; tocar Aprobar limpia el gate y el loop reanuda.

## Salida final (para Augusto)

Tabla en castellano- `telegram.ts` (notify + listener) · enganche en `gates.ts` · script `bot` · seguridad/allowlist · tests. Y una frase- ¿puede Augusto aprobar gates y mandar ideas desde el celu sin tocar la compu? Si algo quedó pendiente (ej. webhook vs polling), decilo explícito.
