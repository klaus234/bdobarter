// ============================================
// BARCOS GUARDADOS
// Hasta 5 barcos con nombre, velocidad % y aceleración %. Viven en su propia
// clave de localStorage y NO entran ni en Guardar Estado ni en los savestates
// de rutas: son del jugador, no de la ruta.
//
// Guardan SOLO velocidad y aceleración. La maestría y el Diario de Manos son
// del personaje, no del barco, así que quedan afuera a propósito y no cambian
// al alternar de barco.
//
// Se sigue escribiendo BarcoVel / BarcoAcc en localStorage porque
// calculadora_retraso.html los lee de ahí.
// ============================================
const Barcos = (function () {
    const CLAVE = "Barcos";
    const CLAVE_ACTIVO = "BarcoActivo";
    const MAX = 5;

    let slots = [];
    let activo = 0;
    let inpVel, inpAcc, spanNombre, contSlots, alCambiar;
    let pendiente = null; // timer del guardado diferido (ver escribirPronto)

    function porDefecto(i, vel, acc) {
        return { nombre: "Barco " + (i + 1), vel: vel || 191, acc: acc || 196 };
    }

    function leer() {
        let guardados = [];
        try { guardados = JSON.parse(localStorage.getItem(CLAVE)) || []; } catch (e) { guardados = []; }
        // la primera vez el slot 1 hereda lo que ya estaba en el panel
        const velInicial = parseFloat(inpVel && inpVel.value) || 191;
        const accInicial = parseFloat(inpAcc && inpAcc.value) || 196;
        slots = Array.from({ length: MAX }, (_, i) => {
            const s = guardados[i];
            if (!s) return porDefecto(i, i === 0 ? velInicial : 0, i === 0 ? accInicial : 0);
            return {
                nombre: String(s.nombre || "Barco " + (i + 1)).slice(0, 22),
                vel: parseFloat(s.vel) || 191,
                acc: parseFloat(s.acc) || 196
            };
        });
        const i = parseInt(localStorage.getItem(CLAVE_ACTIVO), 10);
        activo = (i >= 0 && i < MAX) ? i : 0;
    }

    function escribir() {
        clearTimeout(pendiente);
        pendiente = null;
        localStorage.setItem(CLAVE, JSON.stringify(slots));
        localStorage.setItem(CLAVE_ACTIVO, String(activo));
        // espejo para la calculadora de retraso, que los lee sueltos
        localStorage.setItem("BarcoVel", String(slots[activo].vel));
        localStorage.setItem("BarcoAcc", String(slots[activo].acc));
    }

    // Escribir en cada tecla son 4 setItem por pulsación: tipear "191" hacía
    // 12 escrituras. El objeto en memoria se actualiza al instante igual, así
    // que solo se difiere el volcado a localStorage.
    const ESPERA = 600;

    function escribirPronto() {
        clearTimeout(pendiente);
        pendiente = setTimeout(escribir, ESPERA);
    }

    // Vuelca lo que haya quedado pendiente. Se llama al cerrar o esconder la
    // pestaña, y antes de cualquier cosa que dependa de lo guardado.
    function volcar() {
        if (pendiente) escribir();
    }

    // panel -> slot (mientras se escribe en velocidad / aceleración)
    function tomarDelPanel() {
        slots[activo].vel = parseFloat(inpVel.value) || 0;
        slots[activo].acc = parseFloat(inpAcc.value) || 0;
        escribirPronto();
    }

    // slot -> panel
    function aplicarAlPanel() {
        inpVel.value = slots[activo].vel;
        inpAcc.value = slots[activo].acc;
        inpVel.dispatchEvent(new Event("input", { bubbles: true }));
        inpAcc.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function render() {
        spanNombre.textContent = slots[activo].nombre;
        contSlots.innerHTML = "";
        slots.forEach((s, i) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "barco-slot" + (i === activo ? " activo" : "");
            b.textContent = String(i + 1);
            b.title = `${s.nombre} · ${s.vel}% / ${s.acc}%`;
            b.onclick = () => seleccionar(i);
            contSlots.appendChild(b);
        });
    }

    function seleccionar(i) {
        if (i === activo) return;
        activo = i;
        escribir();
        aplicarAlPanel();
        render();
        if (alCambiar) alCambiar();
    }

    // Renombrar en el lugar: el título se cambia por un input y vuelve al
    // confirmar con Enter o al salir del campo.
    function renombrar() {
        if (spanNombre.querySelector("input")) return;
        const previo = slots[activo].nombre;
        const inp = document.createElement("input");
        inp.type = "text";
        inp.className = "barco-nombre-edit";
        inp.value = previo;
        inp.maxLength = 22;
        spanNombre.textContent = "";
        spanNombre.appendChild(inp);
        inp.focus();
        inp.select();

        let cerrado = false;
        const confirmar = (guardar) => {
            if (cerrado) return;
            cerrado = true;
            if (guardar) {
                slots[activo].nombre = inp.value.trim().slice(0, 22) || previo;
                escribir();
            }
            render();
        };
        inp.addEventListener("keydown", e => {
            if (e.key === "Enter") { e.preventDefault(); confirmar(true); }
            else if (e.key === "Escape") { e.preventDefault(); confirmar(false); }
            e.stopPropagation(); // que la consola no se abra al tipear |
        });
        inp.addEventListener("blur", () => confirmar(true));
    }

    // opts: { onCambio } se llama cuando cambia el barco activo
    function init(opts) {
        inpVel = document.getElementById("barcoVel");
        inpAcc = document.getElementById("barcoAcc");
        spanNombre = document.getElementById("barcoNombre");
        contSlots = document.getElementById("barcoSlots");
        if (!inpVel || !spanNombre || !contSlots) return;
        alCambiar = opts && opts.onCambio;

        leer();
        escribir();
        aplicarAlPanel();
        render();

        inpVel.addEventListener("input", tomarDelPanel);
        inpAcc.addEventListener("input", tomarDelPanel);
        const btn = document.getElementById("btnRenombrarBarco");
        if (btn) btn.onclick = renombrar;

        // Si se cierra o se esconde la pestaña con un guardado pendiente, se
        // vuelca antes de perderlo. pagehide es más confiable que beforeunload
        // en celulares, y visibilitychange cubre el cambio de pestaña (por si
        // se abre la calculadora de retraso, que lee BarcoVel/BarcoAcc).
        window.addEventListener("pagehide", volcar);
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") volcar();
        });
    }

    function nombreActivo() { return slots.length ? slots[activo].nombre : ""; }
    function lista() { return slots.map((s, i) => ({ slot: i + 1, ...s, activo: i === activo })); }

    return { init, seleccionar, nombreActivo, lista, volcar, MAX };
})();
window.Barcos = Barcos;
