> Prompt para Claude Code. Repo: tres-saltenas. Autorizado a commitear y pushear a main (auto-deploy Vercel — solo UI, no toca DB, sin gate de prod).

## Contexto

La app no tiene ningún nav ni links entre pantallas (verificado: `src/app/layout.tsx` es solo `ClerkProvider` + `TRPCProvider`, sin chrome de ningún tipo). Hoy, para ir de una sección a otra hay que escribir la URL a mano. Esto bloquea que Dani (única usuaria real, entra desde el celular) pueda usar la app — es el único pendiente antes de mandarle el link.

Rutas de contenido existentes, todas bajo auth de Clerk: `/` (Dashboard de costeo), `/ventas`, `/compras`, `/produccion`, `/insumos`, `/gastos`, `/retiros`, `/mi-plata`, `/recetas`.

## Diseño

Nav simple, NO un bottom-sheet tipo Kredy (son 9 destinos de uso esporádico para una sola persona, no 10 secciones de un dashboard admin complejo — no corresponde esa complejidad acá). Tira horizontal de pills, sticky arriba de cada página, scrolleable si no entra en el ancho de pantalla (todas las páginas ya usan `max-w-lg mx-auto`, mantené esa convención).

- Componente nuevo `src/components/NavBar.tsx` (client component, `"use client"`), usa `usePathname()` de `next/navigation` para resaltar la pill activa (mismo patrón de contraste simple que ya usan las páginas para estados activos, ej. `PERIODOS` en `src/app/page.tsx` — pill activa con fondo sólido, inactiva con fondo gris claro).
- Ítems y orden: Dashboard (`/`) · Ventas (`/ventas`) · Compras (`/compras`) · Producción (`/produccion`) · Insumos (`/insumos`) · Gastos (`/gastos`) · Retiros (`/retiros`) · Mi Plata (`/mi-plata`) · Recetas (`/recetas`).
- Envolvé el `<NavBar />` en `<SignedIn>` (de `@clerk/nextjs`) dentro de `layout.tsx`, así no aparece en `/sign-in` (donde no hay usuario logueado todavía). Importá `SignedIn` en `layout.tsx`, no en cada página.
- Mobile-first: la tira debe verse bien en una pantalla de celular angosta (~375px), con scroll horizontal táctil si hace falta (`overflow-x-auto`), sin que se corte contenido.
- No hagas un menú hamburguesa ni un drawer — mantenelo simple, es literalmente una tira de links.
- No toques la lógica de ninguna página existente, ni el layout del `<SignIn />`.

## Al terminar

`npx tsc --noEmit` limpio. Confirmá (leyendo el JSX final, no hace falta browser) que las 9 rutas están todas, que la pill activa cambia según la página, y que el nav no aparece cuando no hay sesión. Commit + push a main.
