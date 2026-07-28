# bdobarter

App para calcular las mejores rutas de barter (intercambio oceánico) en Black Desert Online:
optimizador de rutas con dependencias, avisos de llegada del barco con tiempos calibrados
con mediciones reales, animación en el mapa y savestates de rutas.

## Cómo usar

Servir la carpeta con cualquier servidor estático y abrir la raíz:

```
python -m http.server 8123
# → http://localhost:8123/
```

## Páginas

| Página | Qué hace |
|---|---|
| `index.html` | Calculadora de rutas principal (mapa, viajes, avisos de llegada, savestates) |
| `calculadora_retraso.html` | Cronómetro + cálculo del "retraso" de un tramo para `data/retrasos.json` |
| `tools/editor_nodos.html` | Editor visual para posicionar nodos de `data/datos.json` |

## Estructura

```
├── index.html               ← app principal (solo HTML)
├── calculadora_retraso.html
├── css/estilo.css
├── js/
│   ├── modelo.js            ← modelo físico del barco (compartido)
│   ├── datos.js             ← diccionarios de nodos y retrasos
│   ├── algoritmos.js        ← solvers DP de rutas
│   ├── viajes.js            ← render de viajes y tiempos
│   ├── ruta.js              ← lista visual de la ruta + dependencias
│   ├── navegacion.js        ← avisos de llegada, pausa (ESC), sonido
│   ├── savestates.js
│   ├── atajos.js            ← teclas . , ESC
│   ├── mapa.js              ← mapa p5.js (nodos, zoom, barco animado, táctil)
│   ├── fondo_mapa.js        ← caja y carga del fondo real (compartido)
│   ├── puntos_menu.js       ← selector de nodos por nivel
│   └── main.js              ← wiring general
├── data/
│   ├── datos.json           ← nodos (título + coordenadas del mapa)
│   ├── retrasos.json        ← residuos geográficos medidos por tramo
│   └── cache_nodes_v1.json  ← cache de rutas precalculadas (>9 nodos)
├── img/mapa_fondo.webp      ← mapa real del juego, fondo opcional del canvas
├── lib/                     ← p5.js, jQuery, jQuery UI css
└── tools/
    ├── editor_nodos.html
    └── generar_fondo_mapa.py  ← regenera img/mapa_fondo.webp desde los tiles
```

## Fondo real del mapa

El canvas puede usar el mapa del juego de fondo (checkbox «Fondo real del mapa»,
activado por defecto, tanto en `index.html` como en el editor de nodos). La
imagen son tiles de BDO Codex pegados en un solo archivo de ~1.6 MB, que se
descarga en segundo plano recién la primera vez que se activa la opción: nunca
demora la carga inicial, y apagada no se baja.

El calce con `datos.json` es un escalado + traslación ajustado por mínimos
cuadrados: error mediano de 16 unidades (~3 s de viaje). ROSS es un nodo de mar
abierto (uno de los waypoints de Ross Sea), así que no tiene isla debajo: está
bien puesto aunque se vea rodeado de agua.

Para regenerarlo (por ejemplo si se agregan nodos de una región nueva, fuera de
la caja actual) correr `python tools/generar_fondo_mapa.py` y copiar las cuatro
constantes que imprime a `js/fondo_mapa.js`, que es de donde las leen las dos
páginas.

Ver [PLAN_REFACTOR.md](PLAN_REFACTOR.md) para el detalle de la reorganización.
