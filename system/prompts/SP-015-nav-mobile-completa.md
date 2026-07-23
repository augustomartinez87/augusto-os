> Prompt para Claude Code. Ejecutor: Sonnet. Repo: kredy. Autorizado a commitear y pushear a main (auto-deploy vía Vercel, sin gate de prod — esto es solo UI, no toca DB).

## Contexto

`app/dashboard/layout.tsx` tiene el sidebar de desktop con 10 destinos (sección "Préstamos": Cartera, Riesgo, Consulta 360°, Préstamos, Personas, Simulador, Reglas de Tasas, Agente (AP), Políticas de Riesgo; sección "Administración": Usuarios) — todos con `adminOnly: true`, visibles solo para vos (`userIsAdmin`).

El bottom tab bar de mobile (líneas 58-66 y 269-304) solo expone 4: `mobileNavBase` (Simulador) + `mobileNavAdmin` (Préstamos, Cartera, Personas). Los otros 6 — Riesgo, Consulta 360°, Reglas de Tasas, Agente (AP), Políticas de Riesgo, Usuarios — son inalcanzables desde el celular, sin ningún botón "más". Es tu única vía de administrar Kredy y hoy 6 de 10 secciones no las podés abrir desde el teléfono.

Ya existe `components/ui/sheet.tsx` (shadcn) en el repo — usalo para el menú "Más", no agregues una librería nueva.

## Diseño

- El bottom tab bar mantiene 4 slots + un 5to ítem "Más" (icono tipo `MoreHorizontal` de `lucide-react`, ya en el proyecto vía otros iconos del mismo paquete).
- Los 4 slots primarios quedan igual que hoy: Simulador, Préstamos, Cartera, Personas (son los que ya elegiste como frecuentes — no los reordenes sin pedir).
- "Más" abre un `Sheet` (`side="bottom"`) con el resto: Riesgo, Consulta 360°, Reglas de Tasas, Agente (AP), Políticas de Riesgo, Usuarios. Mismo ícono+label que usan en el sidebar de desktop (reusá el array `navigation` existente en vez de duplicar la lista a mano — derivá el contenido del sheet filtrando `navigation` por los items que NO están en `mobileNavAdmin`/`mobileNavBase`, así si el día de mañana agregás un ítem al sidebar aparece solo en el sheet sin tocar este archivo de nuevo).
- El ícono/label "Más" debe verse activo (mismo estilo `isActive` que ya usan los otros tabs — color `hsl(var(--sidebar-active))`) cuando el `pathname` actual es alguno de los ítems que viven DENTRO del sheet (para no perder el feedback de "dónde estoy").
- Dentro del Sheet: lista vertical simple, mismo patrón visual que ya usa el sidebar de desktop (ícono + nombre, fila completa clickeable, cierra el sheet al navegar).
- El "Perfil" (UserButton) que ya está al final del bottom bar (líneas 288-303) se mantiene igual, sin tocarlo — no es parte de este fix.
- No toques `mobileNavBase`/`mobileNavAdmin` como conjunto de "primarios" — solo agregás el 5to ítem "Más" y el Sheet. No te metas con la lógica de admin/no-admin existente (`userIsAdmin`).

## Restricciones clave

- No toques el sidebar de desktop (`visibleNavigation`, líneas 106-180) — este fix es solo mobile.
- No agregues dependencias nuevas — `Sheet` ya está disponible.
- Mobile-first real: probá (o al menos razoná explícitamente) que el Sheet no rompe con el bottom bar fijo (`fixed bottom-0`, z-40) — el Sheet debe quedar por encima (z-index mayor) y cerrar correctamente al tocar afuera o navegar.
- No toques nada de `/ap` (portal del AP) — ese es un layout completamente distinto, fuera de alcance.

## Al terminar

`npx tsc --noEmit` limpio. Confirmá manualmente (o describí cómo lo verificaste) que los 6 destinos que antes eran inalcanzables en mobile ahora abren desde el sheet "Más", y que los 4 primarios + Perfil siguen funcionando igual que antes. Reportá con qué viewport/método verificaste (viewport de dev tools, capturar el DOM renderizado, etc.) ya que no hay QA visual automatizado en este target.
