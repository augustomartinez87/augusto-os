# Visión — augusto-os

## Para qué existe este sistema

Augusto opera como **Product Owner / Director de Producto**, no como coordinador técnico.
La diferencia no es semántica: el PO decide qué se construye y valida que funcione.
El coordinador técnico escribe el código, coordina agentes, revisa PRs.
Cada decisión de diseño del sistema se filtra por: **¿esto acerca a Augusto a operar como PO, o lo devuelve a coordinador técnico?**

## Los dos laboratorios actuales

- **Spensiv**: app de finanzas personales + préstamos reales + capa AP (Agente Productor). Stack Next.js/tRPC/Prisma/Vercel.
- **Argos**: (pendiente definición local). Stack React/Vite/Supabase.

Spensiv y Argos son **vehículos de validación**, no el destino. El activo estratégico es el sistema (memoria, loops, procesos), no los productos individuales ni los modelos de lenguaje.

## El objetivo real

Un sistema que **cree y opere productos de forma cada vez más autónoma**:
1. El PO define qué se construye (specs, prioridades, criterios de aceptación).
2. El sistema planifica, implementa, verifica y propone.
3. El PO valida por evidencia objetiva (build verde, tests pasan, UI funciona) y aprueba.
4. Los loops nocturnos refactorizan, documentan, proponen deuda técnica.

El sistema es agnóstico de modelo: un rol (Builder, Reviewer, Planner...) puede ejecutarse en Sonnet hoy y en un modelo diferente mañana sin rediseñar la arquitectura.

## Lo que NO es este sistema

- Un asistente de chat que espera instrucciones.
- Un demonio que toma decisiones de negocio sin aprobación.
- Infra para impresionar: si una fase no devuelve tiempo a Augusto, se saltea.
