# augusto-os — Crítica y visión de producto

> **La brújula:** "Quiero abrir la app para ver qué está haciendo mi equipo."
> No es un requisito funcional. Es el objetivo emocional. Todo lo que no sirva a esa frase, sobra. Toda decisión de diseño se valida contra ella.

---

## Veredicto en una línea

La visión es correcta y diferenciable, pero el 90% del riesgo está en un solo punto: **augusto-os puede convertirse en teatro**. Agentes simpáticos narrando trabajo que en el fondo es delgado. Si la vida visible es decorativa, el producto encanta dos semanas y muere. Si la vida visible es *telemetría real traducida a lenguaje humano*, tenés algo que nadie más tiene. Todo el documento gira alrededor de esa frontera.

---

## 1. Lo que ya funciona (no lo toques)

**La tesis del protagonista.** Que el héroe sea el equipo y no la tarea es la decisión más fuerte que tomaste. Es lo que separa esto de Linear/Asana/cualquier tracker. No la diluyas.

**La honestidad del estado de reposo.** En tu mock web el sistema dice "en reposo — ningún feature corriendo". Eso es oro y va contra el instinto de llenar la pantalla. Mantenelo: un equipo que a veces descansa es creíble; uno que siempre está "trabajando" es una pecera.

**Tenés telemetría real.** El log de tu mock muestra eventos crudos reales: `SLEEP arrancó F-0099`, `tope diario alcanzado`, `Lock stale (660s), pisando...`, `ID NONEXISTENT-999 no encontrado`. Esto es la materia prima. La mayoría de los productos que intentan esto *no* tienen el sustrato y terminan inventando actividad. Vos no necesitás inventar nada. Esa es tu ventaja injusta.

**El relevo (Planner → Researcher → Builder → Tester → Deployer).** El handoff entre agentes es el núcleo emocional y nadie lo está visualizando bien. Ver la posta pasar de mano en mano es la "película" que el usuario va a abrir la app para mirar. Es tu equivalente al feed de Slack o al activity de GitHub.

---

## 2. El problema central: todavía es un dashboard

Tu propio diagnóstico es correcto, y tu mock desktop lo confirma. Lo que mostrás sigue siendo *mission control*: grilla densa de cards de igual peso, métricas compitiendo arriba a la derecha (`3 activos`, `1 esperando`, `4h 12m`), backlog, ideas, estado del sistema, conversaciones — todo gritando al mismo volumen. Eso es Linear con avatares. No es un sistema operativo.

Un dashboard responde "¿cuál es el estado de todo?". Un centro de operaciones responde "¿qué está pasando *ahora*?". Son jerarquías opuestas:

- **Dashboard:** muchas cosas, igual peso, lectura exhaustiva.
- **Centro de operaciones:** un héroe (el equipo vivo), el resto en disclosure progresivo.

La cura no es agregar más vida a las cards. Es **bajar densidad y subir jerarquía**: un solo héroe por pantalla. El equipo trabajando ocupa el centro de gravedad; backlog, ideas, métricas y estado del sistema son drill-downs, no co-protagonistas. Las métricas chip de arriba (`3 activos / 1 esperando`) son lo *menos* importante que podés mostrar y hoy están en la posición más cara de la pantalla. Degradalas.

---

## 3. El tradeoff de la personalidad (tu duda principal)

Acá está tu pregunta de fondo: ¿memoria por agente? ¿personalidad consistente? ¿hasta dónde?

Mi posición es fuerte y deliberada:

### La memoria es del sistema. La voz es del rol.

Separá dos cosas que estás mezclando:

**Memoria episódica por agente** (que el Builder "recuerde" lo que hizo la semana pasada, que tenga arco, que evolucione como personaje) → **no la construyas.** Es una trampa de scope con tres costos:

1. **Deuda cognitiva.** Le pedís al usuario que recuerde el estado emocional/narrativo de cinco personajes. Eso es trabajo, no magia.
2. **Uncanny valley de expectativas.** En cuanto un agente "recuerda", el usuario espera coherencia perfecta. El primer olvido o contradicción rompe la ilusión más violentamente que si nunca hubiera prometido memoria. Prometer poco y cumplir siempre > prometer relación y fallar.
3. **Parasocialidad peligrosa** (lo expando en riesgos). Operás software financiero. Un agente con "personalidad evolutiva" invita a confiar en el personaje, no en el output. No querés eso.

**Voz consistente del rol** (el Tester siempre suena como el Tester, escéptico y seco; el Planner siempre serio) → **sí, y es barato.** Es una *capa de renderizado* sobre estado real, no un personaje con vida interior. El Planner no "es" serio; el sistema *renderiza* los eventos del planner con un tono serio. Esa distinción lo cambia todo: la personalidad es un tema visual/tonal, no un subsistema con estado.

> Regla: **los roles son funciones, no amigos.** Rocky de Project Hail Mary funciona porque casi no habla y comunica por la acción. Competencia silenciosa demostrada, no carisma narrado. Eso te dice que la dirección correcta es *menos* charla y *más* trabajo visible, no al revés.

### Las frases: el punto donde esto se vuelve magia o gimmick

Tu instinto de frases tipo El Principito es bueno como *tono*, pésimo como *implementación* si las rotás de una lista estática en un timer. Una frase que aparece sin un evento detrás es decoración, y la decoración se vuelve wallpaper en una semana.

La regla que lo salva: **las frases se generan desde eventos reales, no se sortean de una lista.**

- Teatro (lista estática, rota cada 10s): *"¿Por qué todos creen que funciona?"* — sin nada detrás. Wallpaper en 5 días.
- Magia (derivada del evento): el Tester corre 28 pruebas, 1 falla → *"28 pruebas. Una se rompió. La estoy mirando."* — informa **y** tiene voz.

La frase debe transportar información que igual necesitabas mostrar, vestida con el tono del rol. Si removés la personalidad y la frase sigue siendo útil, está bien diseñada. Si al removerla no queda nada, era teatro.

Y un principio que es casi una ley:

> **La personalidad retrocede cuando suben los stakes.** Whimsy en reposo; sequedad clínica en una caída de prod. Un Deployer que cita un cuento infantil mientras producción está caída destruye la confianza. La relación entre stakes y personalidad es inversa.

---

## 4. Principios de diseño (los tenets, tu HIG)

Estos son la herramienta más útil del documento. Cuando dudes de una feature, pasala por acá:

1. **El equipo es el protagonista; las tareas son el decorado.**
2. **Movimiento = cambio. En reposo, calma.**
3. **La personalidad retrocede cuando suben los stakes.**
4. **Cada elemento vivo informa, no solo encanta.** Si encanta sin informar, se va.
5. **Competencia silenciosa (Rocky), no carisma ruidoso (Clippy).**
6. **La memoria es del sistema; la voz es del rol.**
7. **Densidad baja, jerarquía alta: un héroe por pantalla.**
8. **No mentir actividad.** Si el equipo está en reposo, decilo con calma. Nunca llenar espacio con vida falsa.
9. **Permiso para cerrar la app.** El usuario debe poder irse tranquilo, no quedar enganchado.
10. **Los agentes no narran esfuerzo; narran progreso.** Trabajar media hora y cerrar con una línea ("Comparé tres enfoques, recomiendo el segundo") pesa más que seis actualizaciones intermedias.
11. **El feed es la historia de la empresa, no la historia del CPU.**
12. **Lo que persiste se disciplina; lo efímero puede ser rico.** El roster (estado, se sobrescribe, sin historia) puede ser granular; el feed (acumula, inmutable) calla.

---

## 5. Riesgos

### UX
- **Card-grid de igual peso** (lo de arriba): ahoga la jerarquía. → Un héroe, el resto en disclosure.
- **Animación simultánea:** cinco avatares "respirando" a la vez no es vida, es acuario/casino. La calma es el default; el movimiento es la excepción que señala un cambio.
- **Frases en timer:** se vuelven ruido. → Solo event-driven.

### Psicológicos (los más serios en tu contexto)
- **Sobre-confianza / parasocialidad.** Agentes competentes y adorables → el usuario revisa menos. En software financiero eso es un riesgo real, no estético. El encanto no debe limar los errores. Cuando algo falla, tiene que ser *legible* e incluso un poco *incómodo* de ver. El charm nunca suaviza una falla.
- **Compulsión / pull-to-refresh.** "Mi equipo siempre está trabajando" puede volverse máquina tragamonedas. Antídoto: un estado de reposo genuino y la sensación de "por ahora, listo". El producto debe darte permiso de cerrarlo.
- **Culpa de fundador.** "Mi equipo trabaja, ¿y yo?" Evitá lenguaje que implique que los agentes "sufren", "esperan ansiosos" o que interrumpirlos es malo. Son herramientas con voz, no criaturas con necesidades.

### Fatiga / el problema de los 6 meses
La novedad (pixel art + frases) decae: deleite el día 1, ruido el día 30, molestia el día 90. Sobrevive **solo** si la personalidad carga densidad de información. La prueba de los 6 meses: si dentro de seis meses el usuario sigue abriendo la app, no va a ser por las frases — va a ser porque en *tres segundos de un vistazo* entiende el estado de su empresa mejor que con cualquier otra herramienta. Diseñá para el vistazo de glanceabilidad, no para el chiste. El chiste es el gancho del día 1; la glanceabilidad es la retención del mes 6.

---

## 6. Doctrina de movimiento

Apple lo dice mejor que nadie: el movimiento debe significar algo, y casi todo debe estar en reposo.

- **Default = quietud.** Una pantalla en calma con un solo punto que late es más viva que diez cosas animándose.
- **El movimiento señala un cambio de estado**, no corre en loop. Un avatar "escribe" *cuando* genera output, no permanentemente. Un estado transiciona suave *cuando* cambia, no como adorno.
- **Jerarquía de movimiento:** el agente activo *ahora* puede tener micro-animación; los inactivos están perfectamente quietos. La quietud de los demás hace que el activo destaque sin esfuerzo.
- **Una firma de micro-animación por rol, atada a su función** (el Researcher: un destello en los anteojos al encontrar algo; el Builder: teclas al commitear), **solo cuando está activo.** Nunca ambiental.

Esto te separa de Discord (todo titila) y de un videojuego (todo se mueve). Vida ≠ movimiento constante. Vida = movimiento *significativo* sobre un fondo en calma.

---

## 7. Identidad visual

**Pixel art como retrato, no como entorno.** Acá está tu diferencia clave con Pixel Agents: ellos hacen un *mundo* (oficina, sprites caminando, mapa). Eso es un juguete y un mundo te obliga a un nivel de detalle y a una estética lúdica que choca con "profesional, oscuro, minimalista". Vos querés **bustos / avatares de roster**, como la tripulación de una nave. Sin mapa, sin caminar, sin oficina. Retratos, no personajes que deambulan.

- **Silueta + color por rol.** Cada agente reconocible por silueta y un color de acento. Eso permite identificarlos de reojo (glanceabilidad otra vez).
- **Oscuro con un acento cálido por estado**, con muchísima restricción. El color es información (activo / esperando / falla), no decoración.
- **Tipografía al frente.** La estética Linear/Apple la carga el texto y el espacio, no los adornos. El feed *es* el diseño. El pixel art es la firma, no el contenido.
- **Una constante visual de marca** (un glyph, un punto, una retícula sutil) que aparezca en web, mobile y favicon. Hoy "augusto-os" como wordmark ya tiene carácter; construí alrededor de eso.

---

## 8. Diferenciación (por qué esto no es otra cosa)

- **vs Linear/Asana:** ellos son task-centric con equipo humano — *vos hacés el trabajo*. augusto-os es agent-centric y vos sos el único humano — *vos supervisás trabajo que se hace solo*. Jerarquía invertida.
- **vs Cursor / Claude Code:** viven *dentro* del editor, una sesión, efímeros, un proyecto. augusto-os es la **meta-capa por encima de muchos proyectos**: persistente, ambiental, la "vista empresa", no la "vista archivo". Cursor te muestra qué corre en *este* repo; augusto-os te muestra qué hace *tu compañía*.
- **vs Pixel Agents:** ellos son visualización-juguete de los agentes de *una* máquina, un mundo lúdico. Vos usás pixel art como **identidad**, no como game world. Misma materia prima (pixel + agentes), producto opuesto: ellos optimizan para "qué divertido", vos para "qué está pasando".

El espacio que ocupás —ambiental, multi-proyecto, agent-centric, profesional— está vacío. Nadie está exactamente ahí.

---

## 9. Qué eliminar, simplificar, potenciar

**Eliminar**
- Frases rotando en timer. (Solo event-driven.)
- Animación ambiental continua. (Solo en cambio de estado.)
- Memoria episódica por agente como feature. (La memoria es del sistema.)
- La grilla de cards de igual peso como pantalla principal.
- Mundo/oficina estilo Pixel Agents.

**Simplificar**
- Las métricas chip (`3 activos / 1 esperando / 4h`): degradar, sacar de la posición prime.
- Nav Loop/Backlog/Ideas como co-iguales: **Loop deja de ser una tab; se vuelve el home.** Backlog e Ideas pasan a secundarios.
- Las "conversaciones del equipo" de tu mock: o son reales (derivadas de eventos) o no van. No simules un chat.

**Potenciar**
- **El feed unificado** que se lee como un canal de equipo. Este es el gancho tipo Slack/GitHub. Es lo que el usuario abre a mirar.
- **El relevo del Loop:** la coreografía del handoff entre agentes, mostrada como narración en vivo. Tu diferenciador emocional.
- **La capa de narración** evento-crudo → utterance-humano. Es el corazón del producto (sección 10).
- **El estado de reposo honesto.**

---

## 10. La pieza que hace o rompe el producto: la capa de narración

Esto merece su propia sección porque es donde está el producto real, no en el pixel art.

Tenés logs crudos (`markBacklogState: ID NONEXISTENT-999`). Tenés roles con voz. **El producto es el puente entre los dos:** un mapeo de eventos del sistema a frases con tono de rol, que informan y tienen personalidad al mismo tiempo.

```
evento crudo            →   narración del agente (rol + dato real)
test_run(28, fail=1)    →   Tester: "28 pruebas. Una se rompió. La estoy mirando."
commit(7f3a2b1, 3files) →   Builder: "Tres archivos. La migración quedó."
lock_stale(660s)        →   (sin whimsy — stakes altos) "Lock viejo detectado. Pisando."
loop_idle               →   "Equipo en reposo. Nada corriendo."
```

Reglas de la capa:
1. **Cada utterance se ancla a un evento.** Sin evento, sin frase.
2. **El dato real va en la frase.** Números, nombres de archivo, IDs. La personalidad viste el dato, no lo reemplaza.
3. **Tono escalado por stakes.** Reposo → voz de rol completa. Error/incidente → voz clínica, cero whimsy.
4. **Frecuencia con techo.** Un agente no habla cada 2 segundos. Hablar es señal; si habla siempre, no señala nada.

Si construís bien *esto*, las frases nunca se vuelven wallpaper porque cada una es noticia. Si no lo construís, ninguna cantidad de pixel art te salva.

---

## 11. Ideas adicionales en la misma filosofía

- **Reposo como primer-class state.** Una pantalla de "equipo en reposo" diseñada con tanto cuidado como la de actividad: silenciosa, satisfecha, que te da permiso de cerrar la app. Contraintuitivo y muy on-brand.
- **El "informe de fin de turno".** En vez de notificaciones constantes, un resumen cuando un Loop termina: qué hizo el equipo, qué decidió, qué espera tu aprobación. Respeta tu atención en lugar de pelearla. Encaja con tu regla de "requiere aprobación explícita".
- **Aprobaciones como el único momento donde *vos* entrás en escena.** El equipo trabaja solo hasta que toca una frontera (deploy a prod, SQL destructivo, documento legal). Ahí, y solo ahí, el producto te reclama. Eso hace tu rol —supervisar, decidir— tangible y le da peso a tu presencia.
- **Un sonido, uno solo, opcional.** Un tono sutil al completarse un Loop. Nada más. El silencio es parte del lujo.
- **Filtro por proyecto** (Argos / Kredy / Spensiv) como lente sobre el mismo equipo, no como secciones separadas. El equipo es uno; cambia el proyecto que miran.
- **"Last seen" honesto del agente.** En vez de fingir que están siempre activos, "hace 12s / en reposo desde las 14:30" — credibilidad por sobre ilusión.

---

## 12. Visión refinada de augusto-os

**Una superficie principal: Operaciones.** Abrís la app y no ves un dashboard: ves a tu equipo. Arriba, un roster horizontal de retratos —quién está activo destaca por movimiento sutil, quién está en reposo está en calma absoluta—. En el centro, si hay un Loop corriendo, la película: el relevo Planner → Researcher → Builder → Tester → Deployer, narrado en vivo, cada línea anclada a un evento real con la voz de su rol. Debajo, un feed unificado que se lee como el canal de tu empresa. Backlog, Ideas y métricas existen, pero a un clic, nunca compitiendo por el centro.

Si no corre nada, la app te lo dice con calma: *"El equipo está en reposo."* Y está bien. Cerrás tranquilo.

Lo que sentís al abrirla no es "tengo tareas". Es **"¿qué está haciendo mi equipo?"** — la misma curiosidad con la que abrís Slack o GitHub. La diferencia es que acá el equipo no son personas que te deben respuestas: son funciones competentes y silenciosas trabajando para vos, que de vez en cuando levantan la mano cuando necesitan una decisión que solo vos podés tomar.

No es un tracker con avatares. Es el centro de operaciones de una empresa de una sola persona apalancada en agentes. Esa frase no la puede decir Linear, ni Cursor, ni Pixel Agents.

---

## 13. Qué NO construir todavía (para no sobre-ingeniería)

- Memoria/arco por agente. (Quizás nunca.)
- Chat bidireccional con cada agente. (Empezá observando, no conversando. La conversación es v2 y solo si la observación ya enamora.)
- Personalización profunda de la oficina/avatares. (Es esfuerzo en lo decorativo cuando el valor está en la narración.)
- Multi-usuario / equipos humanos. (El producto es para *un* fundador. Eso es la identidad, no una limitación.)

**El orden correcto de construcción:** primero la capa de narración (evento → utterance) sobre tu telemetría real, en una sola pantalla de Operaciones, con UN agente. Si con un agente narrado ya te dan ganas de abrir la app a mirar, tenés producto. Recién ahí agregás los cinco, el pixel art fino y las animaciones. El pixel art es la última capa, no la primera — es tentador empezar por ahí porque es lo divertido, y es exactamente el error que volvería esto un gimmick.

---

## 14. Bitácora de decisiones

Decisiones cerradas en sesión de diseño. Lo que está acá no se reabre sin un motivo explícito.

### Decisión 01 — Gramática de eventos de cuatro niveles
Todo evento del sistema cae en uno de cuatro niveles, ordenados por valor de señal para el supervisor (no por interés técnico):

1. **Silencio (log-only):** heartbeats, polls, reintentos, lecturas, locks normales, escrituras de rutina. Viven en el log crudo, nunca suben. Si pasa en cada run y nada depende de eso, es silencio.
2. **Pulso ambiental (estado, sin palabras):** "activo", microanimación, tiempo transcurrido, contexto actual. Es el roster.
3. **Narración (digno de feed):** momento discreto, significativo y *cerrado* (handoff, commit, resultado de tests, decisión, hallazgo). Una línea, anclada a dato real, en voz del rol. Umbral: ¿lo mencionaría un compañero competente en un standup?
4. **Interrupción (te reclama):** eventos-frontera (deploy a prod, SQL destructivo, doc legal, dinero, falla que bloquea el loop). Rompe la calma, notifica, voz clínica.

Eje transversal — **falla:** se muestra por si está *resuelta*, no por si ocurrió. Auto-healing casi invisible; lo irreversible, fuerte.

**No existe una quinta categoría de "señal de progreso".** Introducirla devuelve el feed a un log y destruye la separación. Rechazada a propósito.

### Decisión 02 — Roster = presente; feed = pasado
El roster responde "¿quién está vivo y qué hace ahora?" (presente continuo, ambiental, sin palabras). El feed responde "¿qué cambió realmente?" (pasado, narrado, una línea por evento cerrado). Lo en-curso nunca va al feed; los deltas cerrados sí. El feed es un registro de hechos, no un stream de actividad.

Corolario: lo que persiste se disciplina, lo efímero puede ser rico. El roster se sobrescribe (sin historia) → puede ser granular. El feed acumula (inmutable) → calla.

### Decisión 03 — La disciplina del silencio exige un roster honesto (precondición acoplada)
Aceptar que un agente pase ~20 min sin línea de feed es honesto **solo si** el roster carga la vida: contexto que puede cambiar, tiempo transcurrido visible y, a partir de cierta duración en el mismo estado, una señal visual sutil de "esto está tardando" (no alarma — eso es interrupción). Sin esto, el silencio se degrada de honestidad a ambigüedad y el usuario no puede distinguir "piensa" de "se colgó". 02 y 03 son una sola decisión acoplada.

### Hilos abiertos (no cerrar todavía)
- **El feed como bitácora de decisiones / auditoría.** Si el feed es la historia de la empresa, gana valor a largo plazo como registro consultable de decisiones. Posible evolución hacia decision log / audit trail para fundador solo. No desarrollado aún.
- Nivel de personalidad por rol y presupuesto de whimsy por severidad (sesión 2).
- Identidad visual: retrato pixel como observabilidad humanizada (sesión 3).
- Retención a 6 meses: glanceabilidad, informe de fin de turno, reposo (sesión 4).
