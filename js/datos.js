// Datos: diccionarios de nodos y retrasos + clase Nodo
// (extraído de index.html sin cambios de lógica)

// ============================================
// CONFIGURACIÓN Y ESTADO GLOBAL
// ============================================
let dependenciasEncadenadas = false;
const nodosDic = {};
let resultadoViajes = [];
let ndata;
let ignoreCache = false;

// Retrasos entre nodos (retrasos.json): distancia extra en unidades de
// mapa por giros/maniobras, medida con calculadora_retraso.html.
// Clave simétrica "A|B" (orden alfabético). Si no hay dato, retraso 0.
const retrasosDic = {};
function retrasoEntre(a, b) {
    const clave = [String(a).toUpperCase(), String(b).toUpperCase()].sort().join("|");
    return retrasosDic[clave] || 0;
}

// ============================================
// CLASES
// ============================================
class Nodo {
    constructor(x, y, titulo) {
        this.x = x;
        this.y = y;
        this.titulo = titulo;
    }

    distancia(otro) {
        return Math.sqrt(
            Math.pow(this.x - otro.x, 2) + Math.pow(this.y - otro.y, 2)
        );
    }
}
