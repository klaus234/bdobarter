// ============================================
// FONDO REAL DEL MAPA (compartido por index.html y tools/editor_nodos.html)
//
// img/mapa_fondo.webp es el mapa del juego, generado con
// tools/generar_fondo_mapa.py a partir de los tiles de BDO Codex. Se dibuja
// estirado entre las esquinas (X0,Y0) y (X1,Y1), en coordenadas de datos.json:
// el ajuste es un escalado + traslación, con error mediano de 16 unidades
// (~3 s de viaje). Si se agregan nodos fuera de esa caja hay que regenerar la
// imagen y actualizar estas cuatro constantes (el script las imprime).
//
// Cada página dibuja con su propio transform; acá viven la caja, la carga y
// el estado, que son lo único que tiene que coincidir entre las dos.
// ============================================
const FondoMapa = (function () {
    // esquinas de la imagen, en coordenadas de datos.json
    const X0 = -4472.2;
    const Y0 = -3259.9;
    const X1 = 4585.3;
    const Y1 = 3675.9;
    // velo oscuro (~45%): el terreno claro no se come las etiquetas
    const VELO = 115;

    let img = null;
    let estado = "vacio"; // vacio | cargando | listo | error

    // Pide la imagen (~1.6 MB) una sola vez y en segundo plano: loadImage()
    // fuera de preload() no bloquea, así el mapa se dibuja desde el primer
    // frame y la imagen entra cuando llega. alCargar() sirve para repintar.
    function pedir(url, alCargar) {
        if (estado !== "vacio") return;
        estado = "cargando";
        loadImage(url,
            imagen => {
                img = imagen;
                estado = "listo";
                if (alCargar) alCargar();
            },
            () => {
                estado = "error"; // cada página sigue con su fondo estilizado
                console.warn("No se pudo cargar " + url + ": queda el fondo estilizado.");
            });
    }

    function listo() { return estado === "listo"; }
    function imagen() { return img; }

    return { X0, Y0, X1, Y1, VELO, pedir, listo, imagen };
})();
