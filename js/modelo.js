// ============================================
// MODELO FÍSICO DEL BARCO (compartido por index.html y calculadora_retraso.html)
//
// Recalibrado (jul-2026) con 36 tramos medidos en el juego:
//   d_eff = K_RUTA·d_recta + D_FIJA + retraso_residual
//   v = V0·vel/100 (unid/s crucero) ; a = A0·acc/100 (unid/s² arranque)
//   t = d_eff/v + v/(2a)    | t = sqrt(2·d_eff/a) en tramos cortos
// K_RUTA=3.511 (el camino real ≈ 3.5× la línea recta del mapa) y
// D_FIJA=307 unid (~19 s: atraque + arranque + boost promediado) salen
// de un ajuste por mínimos cuadrados sobre 16 tramos de mar abierto
// (R²=0.94, error mediano ~15 s).
// El retraso de retrasos.json es el RESIDUO geográfico del tramo
// (rodear continentes) respecto de este modelo; sin dato, 0.
// ============================================
const Modelo = (function () {
    const V0 = 10.2;
    const A0 = 1.42;
    const K_RUTA = 3.511;
    const D_FIJA = 307;

    function velocidad(vel) { return V0 * vel / 100; }
    function aceleracion(acc) { return A0 * acc / 100; }

    // distancia efectiva que el modelo espera para una recta del mapa
    function distanciaModelo(distRecta) { return K_RUTA * distRecta + D_FIJA; }

    // distRecta: línea recta del mapa; retraso: residuo geográfico (retrasos.json)
    function estimarSegundos(distRecta, vel, acc, retraso) {
        const v = velocidad(vel);
        const a = aceleracion(acc);
        const dEff = Math.max(0, distanciaModelo(distRecta) + (retraso || 0));
        const dArranque = (v * v) / (2 * a);
        if (dEff <= dArranque) return Math.sqrt(2 * dEff / a);
        return dEff / v + v / (2 * a);
    }

    // Inversión: de un tiempo real medido a la distancia efectiva recorrida
    function distanciaMedida(t, vel, acc) {
        const v = velocidad(vel);
        const a = aceleracion(acc);
        return (t <= v / a) ? (a * t * t / 2) : ((t - v / (2 * a)) * v);
    }

    // m:ss (tiempos de tramo / viaje)
    function fmt(seg) {
        seg = Math.max(0, Math.ceil(seg));
        return Math.floor(seg / 60) + ":" + String(seg % 60).padStart(2, "0");
    }

    // hh:mm:ss (tiempo total de todos los viajes)
    function fmtHMS(seg) {
        seg = Math.max(0, Math.ceil(seg));
        const h = Math.floor(seg / 3600);
        const m = Math.floor((seg % 3600) / 60);
        const s = seg % 60;
        return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    }

    return { V0, A0, K_RUTA, D_FIJA, velocidad, aceleracion, distanciaModelo, estimarSegundos, distanciaMedida, fmt, fmtHMS };
})();

// distancia euclídea entre dos puntos del mapa (helper global histórico)
function dist2(x1, y1, x2, y2) {
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}
