# Plan de refactorización y organización — BDO Barter

> Estado: **EJECUTADO** (jul-2026). Fases F0–F4 aplicadas, un commit por fase.
> Decisiones tomadas: legacy borrado (no `legacy/`), **F5 descartada**
> (jQuery se queda, decisión del usuario), JSONs movidos a `data/`.
> F6 aplicada parcialmente (README actualizado).

## 1. Diagnóstico del estado actual

### 1.1 Estructura de hoy (todo en la raíz)

| Archivo | Rol | Estado |
|---|---|---|
| `index.html` (ex `barter_v3.html`) | App principal | **Monolito ~2400 líneas**: ~800 de CSS + ~1500 de JS inline |
| `mapa_zoom.js` | Mapa p5.js (nodos, zoom, barco) | OK, pero acoplado por globals |
| `puntos_menu.js` | Selector de nodos por nivel | OK, chico |
| `estilo.css` | Solo estila el selector de niveles | El 90% del CSS real vive inline en `index.html` |
| `calculadora_retraso.html` | Calculadora + cronómetro | **Duplica el modelo físico** de `index.html` |
| `editor_nodos.html` | Herramienta para posicionar nodos | Standalone, OK |
| `datos.json`, `retrasos.json` | Datos vivos | OK |
| `cache_nodes_v1.json` | Cache de rutas precalculadas (>9 nodos) | Vigente solo para rutas sin deps/manual |
| `p5.min.js`, `jquery-1.9.1.min.js`, `jquery-ui.min.css` | Libs | jQuery+UI se usa **solo** para 2 autocompletes |
| `barter.html`, `barter_bestnodo.html`, `barter_bestrecorrido.html`, `mapa.js`, `mapa_bestnodo.js` | Versiones viejas | **Legacy**, sin mantenimiento |
| `datos_bm2.json`, `nodos.txt`, `test.txt` | Respaldos/restos | **Muertos** |

### 1.2 Problemas concretos

1. **Monolito `index.html`**: dentro del `<script>` inline conviven 7 módulos
   (algoritmos DP, `Ruta`, `Navegacion`, `Atajos`, `SaveStates`, renderizador
   de viajes, wiring de `onload`). Editar cualquier cosa implica navegar 2400
   líneas, y el diff de git mezcla CSS/HTML/JS.
2. **Modelo físico duplicado**: `V0`, `A0`, `K_RUTA`, `D_FIJA` y las fórmulas
   están copiadas en `index.html` **y** `calculadora_retraso.html`. Ya nos pasó
   tener que tocar los dos a la vez (recalibración) — es el bug futuro más
   probable.
3. **Acoplamiento por globals implícitos**: `index.html` usa funciones que
   define `mapa_zoom.js` (`nombreDeLinea`, `centrarEnNodo`, `iniciarBarco`,
   `retrasoEntre` al revés, `recNodos` compartido…). Funciona porque todo es
   script clásico global, pero no hay ningún contrato visible de quién usa qué.
4. **Archivos muertos** en la raíz que confunden (¿cuál es el mapa actual,
   `mapa.js` o `mapa_zoom.js`?).
5. **jQuery 1.9.1 (2013) + jQuery UI por CDN** para un solo widget
   (autocomplete), cuando la calculadora ya resuelve lo mismo con `<datalist>`
   nativo. Además el CDN es el único punto que requiere internet.

## 2. Organización de archivos propuesta

```
bdobarter/
├── index.html                  ← solo HTML (estructura)
├── calculadora_retraso.html
├── css/
│   └── estilo.css              ← TODO el CSS (inline actual + estilo.css)
├── js/
│   ├── modelo.js               ← constantes físicas, estimarSegundos, fmt,
│   │                             fmtHMS e inversión (COMPARTIDO con la calculadora)
│   ├── datos.js                ← carga datos.json/retrasos.json, nodosDic,
│   │                             retrasoEntre, nombreDeLinea
│   ├── algoritmos.js           ← DP perfecto, DP con cadenas, modo manual
│   ├── viajes.js               ← renderizarViajes + tiempos por viaje
│   ├── ruta.js                 ← módulo Ruta (lista visual + dependencias)
│   ├── navegacion.js           ← timers de llegada, pausa/ESC, sonido
│   ├── savestates.js
│   ├── atajos.js               ← teclas . , ESC
│   ├── mapa.js                 ← p5 (el actual mapa_zoom.js)
│   ├── puntos_menu.js
│   └── main.js                 ← wiring de window.onload
├── data/
│   ├── datos.json
│   ├── retrasos.json
│   └── cache_nodes_v1.json
├── assets/
│   └── barco.png
├── lib/
│   └── p5.min.js               (+ jquery mientras siga, ver Fase 5)
├── tools/
│   └── editor_nodos.html
├── legacy/                     ← o borrar directamente (git guarda la historia)
│   ├── barter.html, barter_bestnodo.html, barter_bestrecorrido.html
│   ├── mapa.js, mapa_bestnodo.js
│   └── datos_bm2.json, nodos.txt, test.txt
├── PLAN_REFACTOR.md
└── README.md                   ← actualizar: qué es cada página y cómo servirlo
```

Notas:
- Los scripts siguen siendo **clásicos** (no ES modules) y se cargan en orden
  en el HTML: p5 en modo global necesita que `setup`/`draw` sean globales, y
  así no cambia ninguna semántica — solo se mueve código.
- `main.js` queda como único lugar con wiring de eventos; cada módulo expone
  lo suyo en `window.X` como ya hacen `Ruta`/`Navegacion`/`Atajos`/`SaveStates`.

## 3. Fases (en orden)

| Fase | Qué se hace | Riesgo | Beneficio |
|---|---|---|---|
| **F0. Limpieza** | Mover legacy a `legacy/` (o borrar) | Nulo | Raíz legible |
| **F1. CSS afuera** | Extraer el `<style>` de `index.html` a `css/estilo.css` (merge con el actual) | Bajo | Diffs limpios, −800 líneas del index |
| **F2. Modelo compartido** | Crear `js/modelo.js` y usarlo desde `index.html` **y** `calculadora_retraso.html` | Bajo | **Elimina la duplicación más peligrosa** |
| **F3. Modularizar JS** | Extraer los módulos inline a `js/*.js`, uno por commit, sin cambiar lógica | Medio | Archivos de 100-300 líneas, editables |
| **F4. Datos y assets** | Mover JSON a `data/`, `barco.png` a `assets/`, libs a `lib/` (ajustar fetch/loadImage en index, calculadora y editor) | Bajo | Estructura definitiva |
| **F5. (Opcional) Chau jQuery** | Reemplazar los 2 autocompletes por `<datalist>` nativo (como la calculadora) y quitar jquery/jquery-ui/CDN | Bajo | −150 KB, funciona sin internet |
| **F6. (Opcional) Calidad** | JSDoc por módulo, manejo de errores de fetch visible, favicon, README nuevo | Bajo | Mantenibilidad |

El orden importa: F2 antes que F3 (el modelo es el módulo más chico y el que
prueba el mecanismo), y F4 al final para tocar las rutas una sola vez.

## 4. Invariantes (no se rompen en ninguna fase)

- **Claves de localStorage**: `NodosR`, `BarcoVel`, `BarcoAcc`, `ModoManual`,
  `AnimBarco`, `SaveStates` — los guardados existentes siguen andando.
- **Formatos de datos**: `datos.json`, `retrasos.json` (residuos) y las claves
  del `cache_nodes_v1.json` no cambian.
- **URLs**: `index.html` y `calculadora_retraso.html` quedan donde están.
- **Sin build**: el sitio se sigue sirviendo igual (`python -m http.server` o
  doble click); cero dependencias nuevas, cero pasos de compilación.

## 5. Checklist de prueba manual (después de cada fase)

1. Calcular ruta optimizada / con dependencias / modo manual.
2. Play ▶ → countdown, sonido, ⚓, checkbox automático; barco animado; ESC×2.
3. Atajos `.` y `,`.
4. Savestates: guardar (con confirmación al sobreescribir), cargar, borrar.
5. Guardar Estado + recargar página (ruta, barco, checkboxes).
6. Mapa: zoom anclado, click para agregar/quitar, centrar, ver todo.
7. Calculadora: cronómetro (indicador verde/rojo), cálculo de retraso.
8. Editor de nodos abre y carga los nodos.

## 6. Decisiones que quedan de tu lado

1. **Legacy**: ¿borrar (`git rm`, la historia queda en git) o mover a `legacy/`?
2. **jQuery (F5)**: ¿lo sacamos? El autocomplete nativo con `<datalist>` se ve
   distinto (más simple) pero funciona igual de bien.
3. **F4**: mover los JSON a `data/` implica que si tenés bookmarks o scripts
   externos apuntando a `datos.json`/`retrasos.json` en la raíz, cambian de URL.
   ¿Está bien?
4. ¿Alguna página legacy que quieras conservar activa (por ejemplo
   `barter_bestnodo.html`)?

Con tu OK a este plan (y las 4 respuestas), lo ejecuto fase por fase.
