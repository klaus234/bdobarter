#!/usr/bin/env python3
"""Regenera img/mapa_fondo.webp: el mapa real del juego como una sola imagen.

Baja los tiles de BDO Codex (mismo mapa que usan las fan-sites), los pega en un
mosaico que cubra todos los nodos de data/datos.json y lo guarda reescalado.

Además imprime la caja del fondo en coordenadas de datos.json: son las cuatro
constantes FONDO_* de js/mapa.js. Si se agregan nodos fuera de la zona actual
(una región nueva), hay que correr esto de nuevo y actualizar esas constantes.

    python tools/generar_fondo_mapa.py

El ajuste datos.json ↔ mapa real es un escalado + traslación por mínimos
cuadrados sobre 72 nodos (se excluyen ROSS y HAKOVEN, mal ubicados a mano):
error mediano 16 unidades (~3 s de viaje), p90 31.
"""

import io
import json
import os
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(RAIZ, "data", "datos.json")
SALIDA = os.path.join(RAIZ, "img", "mapa_fondo.webp")

TILE_URL = "https://bdocodex.com/zonemap/main/{z}/{x}/{y}.webp"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"}

ZOOM = 5            # nivel de tiles: 29x22 tiles para la zona de barter
TILE = 256
ANCHO_SALIDA = 6144  # ~1.6 MB en webp, ~109 MB de RGBA en el navegador
CALIDAD = 82
OCEANO = (23, 58, 71)  # relleno si algún tile no responde

# datos.json = coord_mapa * escala + origen  (coord_mapa en píxeles del zoom 9)
ESCALA_X = 0.07625164
ESCALA_Y = 0.07696779
ORIGEN_X = -5096.834
ORIGEN_Y = -4205.636


def a_pixel_z9(nodo):
    """Nodo de datos.json → píxel del mapa de BDO Codex en el zoom 9."""
    return ((nodo["x"] - ORIGEN_X) / ESCALA_X,
            (nodo["y"] - ORIGEN_Y) / ESCALA_Y)


def bajar_tile(xy):
    x, y = xy
    pedido = urllib.request.Request(TILE_URL.format(z=ZOOM, x=x, y=y), headers=UA)
    try:
        with urllib.request.urlopen(pedido, timeout=30) as r:
            return x, y, r.read()
    except Exception:
        return x, y, None


def main():
    with open(DATOS, encoding="utf-8") as f:
        nodos = json.load(f)

    # caja de todos los nodos, en tiles del zoom elegido, con un tile de margen
    factor = 2 ** (ZOOM - 9)
    pixeles = [a_pixel_z9(n) for n in nodos]
    xs = [p[0] * factor for p in pixeles]
    ys = [p[1] * factor for p in pixeles]
    tx0, tx1 = int(min(xs) // TILE) - 1, int(max(xs) // TILE) + 1
    ty0, ty1 = int(min(ys) // TILE) - 1, int(max(ys) // TILE) + 1
    ancho, alto = (tx1 - tx0 + 1) * TILE, (ty1 - ty0 + 1) * TILE
    print(f"mosaico zoom {ZOOM}: {tx1-tx0+1}x{ty1-ty0+1} tiles = {ancho}x{alto} px")

    mosaico = Image.new("RGB", (ancho, alto), OCEANO)
    trabajos = [(x, y) for x in range(tx0, tx1 + 1) for y in range(ty0, ty1 + 1)]
    fallados = 0
    with ThreadPoolExecutor(16) as ex:
        for x, y, datos in ex.map(bajar_tile, trabajos):
            if datos is None:
                fallados += 1
                continue
            try:
                tile = Image.open(io.BytesIO(datos)).convert("RGB")
                mosaico.paste(tile, ((x - tx0) * TILE, (y - ty0) * TILE))
            except Exception:
                fallados += 1
    print(f"tiles: {len(trabajos) - fallados}/{len(trabajos)}"
          + (f"  ({fallados} fallaron, quedan en color océano)" if fallados else ""))

    alto_salida = round(alto * ANCHO_SALIDA / ancho)
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    (mosaico.resize((ANCHO_SALIDA, alto_salida), Image.LANCZOS)
            .save(SALIDA, "WEBP", quality=CALIDAD, method=5))
    print(f"guardado {SALIDA}: {ANCHO_SALIDA}x{alto_salida}"
          f"  {os.path.getsize(SALIDA) / 1048576:.2f} MB")

    # las cuatro esquinas del mosaico, ya en coordenadas de datos.json
    def a_datos(px_zoom, escala, origen):
        return px_zoom / factor * escala + origen

    print("\nConstantes para js/mapa.js:")
    print(f"const FONDO_X0 = {a_datos(tx0 * TILE, ESCALA_X, ORIGEN_X):.1f};")
    print(f"const FONDO_Y0 = {a_datos(ty0 * TILE, ESCALA_Y, ORIGEN_Y):.1f};")
    print(f"const FONDO_X1 = {a_datos((tx1 + 1) * TILE, ESCALA_X, ORIGEN_X):.1f};")
    print(f"const FONDO_Y1 = {a_datos((ty1 + 1) * TILE, ESCALA_Y, ORIGEN_Y):.1f};")


if __name__ == "__main__":
    main()
