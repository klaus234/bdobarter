# Contexto para retomar el proyecto

Resumen del estado a **2026-07-28**, pensado para arrancar una sesión nueva sin
tener que releer todo. El README explica *qué es* la app; esto explica *cómo
está armada por dentro*, qué decisiones no son obvias y qué quedó pendiente.

---

## 1. Arranque

```bash
python -m http.server 8123
```

Sin build, sin dependencias que instalar. `.claude/launch.json` ya tiene la
config con el nombre `bdobarter`.

Dos páginas: `index.html` (calculadora de rutas) y `calculadora_retraso.html`
(cronómetro + medición de retrasos). Comparten `css/estilo.css`, `js/modelo.js`,
`js/retrasos.js` y `js/fondo_mapa.js`.

---

## 2. El modelo físico (lo más fácil de romper)

Vive en `js/modelo.js` y lo comparten las dos páginas.

```
d_eff = K_RUTA · d_recta + D_FIJA + retraso
t     = d_eff/v + v/(2a)        (o sqrt(2·d_eff/a) en tramos cortos)
v = V0·vel/100    a = A0·acc/100
K_RUTA = 3.511   D_FIJA = 307   V0 = 10.2   A0 = 1.42
```

**El `retraso` es un residuo en unidades de DISTANCIA, no de tiempo.** Es una
propiedad geográfica del tramo (rodear continentes), independiente del barco.
Consecuencia práctica: cambiar la velocidad mueve los ETA sin invalidar ninguna
medición. Esto ya se usó para justificar dos cambios; no volver a discutirlo.

### Bonos de navegación (sutil)

```js
vel_modelo = vel + (maestria - 11) + (diario ? 5 : 0)
```

Los tramos se midieron **siempre con 11% de maestría fija y SIN el Diario de
Manos**. Ese 11 quedó absorbido dentro de `V0/A0/K_RUTA/D_FIJA`, así que al
modelo solo se le pasa lo que se *aparta* de 11. El diario, en cambio, no estaba
al calibrar, así que suma sus 5 puntos enteros.

Ejemplo: 141% con maestría 11 y diario tildado → el modelo usa **146**, que son
los 157 reales menos los 11 que la fórmula ya tiene adentro.

Todo pasa por `Navegacion.stats()` (`js/navegacion.js`), único punto por donde
salen los ETA. `statsCrudos()` devuelve los valores sin corregir, para el link a
la calculadora de retraso (que aplica el ajuste por su cuenta y no debe recibir
el número ya sumado).

---

## 3. Mapa

`js/mapa.js`, p5.js **0.10.2** (vieja, ojo con las APIs).

- **Fondo real**: `img/mapa_fondo.webp` (6144×4661, ~1.6 MB), mosaico de tiles
  de BDO Codex. Se pide con `loadImage` fuera de `preload()` para no demorar la
  carga, y solo si el checkbox está activo. Caja y carga en `js/fondo_mapa.js`,
  compartido con el editor de nodos.
- **Transformación** datos.json ↔ mapa real: escalado + traslación, sin rotación
  ni shear. Error mediano 16 unidades (~3 s). Regenerar con
  `python tools/generar_fondo_mapa.py`, que imprime las constantes `X0/Y0/X1/Y1`
  para pegar en `js/fondo_mapa.js`.
- **Botón "SEGUIR BARCO"**: dibujado dentro del canvas (no DOM), abajo a la
  derecha. Se come el click de *cualquier* botón del mouse para que el derecho
  no agregue el nodo tapado. Arranca apagado y no persiste.
- **Táctil**: `touchStarted/Moved/Ended` manejan pan con un dedo, tap sobre nodo
  y pinch-zoom. Al definirlos, p5 ya no dispara los handlers de mouse en táctil.

---

## 4. Consola

`js/consola.js`. Se abre y cierra con la tecla **`|`** (izquierda del 1). Detecta
`e.key` (`|`, `°`, `¬`) **y** `e.code === "Backquote"`, así funciona en cualquier
distribución. Dentro de un campo de texto la tecla se escribe normal (para poder
usar `|` en la Nota), salvo en el propio campo de la consola.

Comandos: `help clear reset save complete load loadr find dist add addr viajeadd
rm ship mastery vol done eta nota ss goto`

- **TAB** autocompleta. Si hay un solo candidato lo completa; si hay varios,
  completa el prefijo común **y además lista** (bash lista recién en el segundo
  TAB, acá se decidió listar en el primero).
- **↑ ↓** recorren el historial de la sesión.
- Búsqueda de nodos/savestates en tres etapas: exacto → prefijo → contenido.
  Se queda con la primera que dé un único resultado.
- **Nombres con espacios**: se usa la coma como separador
  (`dist solas chico, orffs`). Sin coma, `dist` acepta dos palabras sueltas.
- Los errores imitan el tono de bash: qué faltó + `uso:` + candidatos.

---

## 5. Persistencia (localStorage)

Hay **tres sistemas independientes**, y mezclarlos fue fuente de confusión:

| sistema | claves | se guarda con |
|---|---|---|
| Estado general | `NodosR`, `ViajesCalc`, `BarcoVel`, `BarcoAcc`, `BarcoMaestria`, `DiarioManos`, `Nota`, `ModoManual`, `MaxNodos`, `NodoInicial`, `AnimBarco`, `FondoReal`, `VolAlarma`, `AlarmaVoz`, `RutaOculta`, `RutaCargada`, `RutaCargadaIdx` | botón **Guardar Estado** |
| Savestates de rutas | `SaveStates` (10 slots) | botones de la lista, o `ss <nombre>` |
| **Barcos** | `Barcos` (5 slots), `BarcoActivo` | **solo, al tocarlos** |

Los barcos (`js/barcos.js`) guardan **únicamente velocidad y aceleración**. La
maestría y el Diario de Manos son del personaje, no del barco, y quedan afuera a
propósito. El guardado tiene **debounce de 600 ms**: el objeto en memoria se
actualiza en cada tecla, solo se difiere el volcado. Cambiar de slot o renombrar
vuelca al instante, y hay flush en `pagehide` / `visibilitychange`.

Se sigue escribiendo `BarcoVel`/`BarcoAcc` sueltos porque
`calculadora_retraso.html` los lee de ahí.

---

## 6. Viajes calculados

`resultadoViajes` es un array de viajes; cada viaje es
`[inicial, parada1, …, paradaN, inicial]`.

Se pueden **agregar, quitar y reordenar** paradas después de calcular. Todo pasa
por `refrescarViajes()` (`js/viajes.js`), que:

1. Anota dónde está el tramo que se está navegando (viaje + título del destino,
   **no la posición**, porque justo eso cambia al reordenar).
2. Lee el progreso (⚓ y checkboxes) **por título de nodo, no por índice**.
3. Rehace la lista.
4. Reaplica el progreso — con `cbox.checked = …`, nunca `.click()`, que volvería
   a togglear el color del nodo en el mapa.
5. **Reengancha** el viaje en curso al botón nuevo con
   `Navegacion.reasignarFila()`. Solo cancela si esa parada ya no existe.

El paso 5 arregló un bug real: antes se cancelaba el viaje activo aunque
estuvieras editando *otro* viaje.

---

## 7. Pendiente / decisiones abiertas

1. **Renombrar los 13 nodos de Margoria.** Están con el nombre del NPC
   (HERACHIO, PAKIO, SOLAS CHICO…) como provisorio. El usuario quiere los
   nombres de la lista de trueque del juego ("Barco de Carga de Heran
   Destrozado"). Esos strings **no están en ninguna base pública** — se buscó a
   fondo en bdocodex (npcs/items/nodes/barter, locale `sp`), bdolytics (caída),
   los datos del mapa de BDFoundry y el foro oficial. **Si vuelve a surgir,
   pedirle que ensanche la ventana de trueque en el juego, no re-buscar.**
   El bloque de IDs de esos NPCs es 50814–50827.

2. **El mapa se ve achatado en horizontal.** p5 le pone al canvas
   `style.width/height` inline; la regla `#defaultCanvas0 { max-width: 100%;
   height: auto }` solo puede pisar el ancho. Cuando la columna mide menos de
   800px el canvas se muestra comprimido (medido: 642×600 con contenido de
   800×600). **Detectado, no arreglado**: la corrección cambia el alto visible
   del mapa en escritorio y el usuario pidió no mover ese diseño. Preguntarle.

3. **Click izquierdo en un nodo del mapa casi nunca lo agrega.** `draw()` pone
   `hoverNodo = null` mientras el botón está apretado, y `mouseReleased()`
   depende de esa variable. Solo funciona si no se dibuja ningún frame entre el
   press y el release. Bug preexistente, ya hay una tarea preparada con el
   arreglo sugerido (resolver el nodo por posición con `nodoEn(x, y)`).

4. **El arrastre para reordenar no funciona con el dedo.** Es drag-and-drop
   nativo de HTML5, solo de escritorio. Misma limitación que la lista de Ruta
   Planeada, así que no es una regresión.

---

## 8. Trampas del entorno de verificación

Esto costó varias horas de confusión; leerlo antes de depurar.

- **El navegador del panel de preview cachea con muchísima fuerza** los `.js`,
  `.css` y `.json`. Ni `navigate` con `force`, ni reiniciar el server lo sueltan.
  Para medir de verdad: `fetch(url + '?cb=' + Date.now())` y evaluar/inyectar lo
  que devuelve, o reiniciar el preview para obtener un contexto nuevo.
- **Con el panel oculto la página no compone frames**: `requestAnimationFrame` se
  frena (y con él el loop de p5), los screenshots devuelven un frame viejo y
  `getComputedStyle` puede dar valores obsoletos. Más de una vez pareció un bug
  de CSS y era esto.
- **Escalado del canvas por eje**: para simular clicks hay que usar
  `rect.width/width` para X y `rect.height/height` para Y **por separado** — no
  son iguales (ver punto 7.2).
- Variables `const` de nivel superior (`Modelo`, `Ruta`, `SaveStates`…) viven en
  el ámbito léxico global, **no** en `window`. Desde una evaluación externa hay
  que nombrarlas directo, no como `window.X`.

---

## 9. Convenciones

- Comentarios y textos de interfaz **en español**, tono rioplatense.
- Los comentarios explican **por qué**, no qué hace la línea.
- Sin build ni dependencias nuevas: todo se sirve estático.
- CSS: los agregados van al final de `estilo.css`, con scope (`.pagina-calc`,
  `.uml1 …`) para no filtrar estilos entre páginas. Ojo con `.ruta-del`, que
  está más abajo en el archivo y le gana por orden a reglas de igual
  especificidad.
- Antes de dar algo por hecho, **medirlo en el navegador**, no deducirlo.
