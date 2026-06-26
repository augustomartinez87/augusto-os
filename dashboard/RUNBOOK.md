# Runbook — Dashboard augusto-os (S-007 v1)

> v1 = monitor (estado del loop en vivo + log + features terminadas) + ideas desde el celu.
> No hay "aprobar" porque el deploy ya es automático en verde (ADR-0019).
> Arquitectura: el loop → `npm run sync` → Supabase → `dashboard/index.html` (estático) → tu celu.

## Setup (una vez, ~15 min)

### 1. Proyecto Supabase (dedicado al control plane)
- console.supabase.com → **New project** (NO uses el de Kredy/Argos). Región us-east-1.
- ⚠️ Free tier: ya tenés argoscapital + Kredy. Si te topa el límite de proyectos, podés reusar uno con las tablas `orch_` (están prefijadas). Pero lo ideal es uno aparte.

### 2. Schema
- Supabase → **SQL Editor** → pegá el contenido de `dashboard/schema.sql` → **Run**.

### 3. Keys (Supabase → Settings → API)
- **Project URL** (`https://xxxx.supabase.co`)
- **anon** key (pública, para el dashboard)
- **service_role** key (secreta, para el runner)

### 4. Conectar el runner
En `orchestrator/.env` (ya tiene los placeholders):
```
SUPABASE_URL=<Project URL>
SUPABASE_SERVICE_KEY=<service_role key>
```

### 5. Conectar el dashboard
En `dashboard/index.html`, reemplazá las dos constantes de arriba del `<script>`:
```js
const SUPABASE_URL = "PEGAR_TU_SUPABASE_URL";   // el Project URL
const SUPABASE_ANON_KEY = "PEGAR_TU_ANON_KEY";  // la anon key
```

### 6. Encender el sync
En una terminal nueva, al lado del loop:
```bat
cd C:\Users\Augusto\Downloads\Proyectos\augusto-os\orchestrator
npm run sync
```
Debería decir *"[sync] Espejando el estado del loop a Supabase cada 5s..."*. Dejalo corriendo. (Ahora el runner son 3 procesos: `npm start` el loop, `npm run bot` Telegram, `npm run sync` el dashboard.)

### 7. Deploy del dashboard (estático)
Es un solo `index.html`. La forma más rápida:
- **Vercel:** entrá a vercel.com/new → arrastrá la carpeta `dashboard/` (o `vercel` CLI dentro de `dashboard/`). Te da una URL `https://xxx.vercel.app`.
- (Cualquier host estático sirve: Netlify drop, Cloudflare Pages, etc.)

### 8. Abrir en el celu
Abrí la URL → "Agregar a pantalla de inicio" para que quede como una app.

## Probarlo
- Con `npm run sync` corriendo, lanzá un feature (`npm start F-XXXX`) → debería verse en vivo en el celu (feature, paso, log).
- Mandá una idea desde el celu → aparece en la lista y el sync la baja a `FEATURE-INTAKE.md` (junto a las de Telegram).

## Notas
- La anon key va pública en el HTML — está OK: RLS sólo deja **leer** y **agregar ideas**, nada más, y la data es estado del sistema (no hay datos de clientes). La URL de Vercel no es adivinable; no la compartas si querés privacidad.
- El dashboard muestra data fresca solo si `npm run sync` está corriendo.
- Pendiente (fast-follow): mostrar el backlog completo, presencia de agentes (S-015), realtime en vez de polling.
