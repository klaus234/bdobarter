// Módulo Atajos: teclas . , y ESC
// (extraído de index.html sin cambios de lógica)

// ============================================
// MÓDULO ATAJOS DE TECLADO
//  "."   → zarpar en el primer tramo disponible desde el puntero
//  ","   → mover el puntero al siguiente tramo (cicla entre viajes)
//  "ESC" → pausar el reloj / cancelar el viaje (segundo toque)
// El puntero se marca con un borde dorado punteado en la lista.
// ============================================
const Atajos = (function () {
    let idx = 0;

    function botones() {
        return Array.from(document.querySelectorAll("#outputnodos .btn-play"));
    }

    function marcar() {
        document.querySelectorAll("#outputnodos .cboxnodo.atajoSel")
            .forEach(f => f.classList.remove("atajoSel"));
        const btns = botones();
        if (btns.length === 0) return;
        if (idx >= btns.length) idx = 0;
        const fila = btns[idx].closest(".cboxnodo");
        if (fila) {
            fila.classList.add("atajoSel");
            fila.scrollIntoView({ block: "nearest" });
        }
    }

    function reset() {
        idx = 0;
        marcar();
    }

    // tecla ",": pasar al siguiente tramo (tras la vuelta, sigue el próximo viaje)
    function siguiente() {
        const btns = botones();
        if (btns.length === 0) return;
        idx = (idx + 1) % btns.length;
        marcar();
    }

    // tecla ".": click en play del primer tramo disponible desde el puntero.
    // Los tramos ya viajados (⚓) o en curso se saltean; si hay un viaje
    // activo o pausado, no hace nada (para no cancelarlo por accidente).
    function zarparActual() {
        if (Navegacion.enViaje()) return;
        const btns = botones();
        if (btns.length === 0) return;
        for (let k = 0; k < btns.length; k++) {
            const i = (idx + k) % btns.length;
            const b = btns[i];
            if (b.innerText === (b.dataset.simbolo || "▶")) {
                idx = i;
                marcar();
                b.click();
                return;
            }
        }
    }

    return { reset, siguiente, zarparActual };
})();
window.Atajos = Atajos;
