// Módulo SaveStates: rutas guardadas con nombre
// (extraído de index.html sin cambios de lógica)

// ============================================
// MÓDULO SAVESTATES: hasta 5 rutas guardadas con nombre
// Cada slot guarda: nombre, ruta (texto con #o_/#d_), nodo inicial,
// máx nodos por viaje y el flag de modo manual.
// ============================================
const SaveStates = (function () {
    const MAX = 10;
    let cargadaNombre = "";  // savestate cargado/guardado por última vez
    let cargadaIdx = -1;     // y en qué slot está (para resaltarlo en la lista)

    // Etiqueta junto al título: "Savestates de Rutas | NOMBRE"
    function actualizarEtiqueta() {
        const sp = document.getElementById("rutaCargadaNombre");
        if (!sp) return;
        sp.innerText = "| " + (cargadaNombre || "Ninguna ruta cargada");
        sp.classList.toggle("sinRuta", !cargadaNombre);
    }

    // resalta en amarillo el slot cargado (sin re-renderizar toda la lista)
    function marcarSlotCargado() {
        document.querySelectorAll("#savestates .savestate").forEach((li, i) => {
            li.classList.toggle("cargado", i === cargadaIdx && cargadaNombre !== "");
        });
    }

    function setCargada(nombre, idx) {
        cargadaNombre = (nombre || "").trim();
        cargadaIdx = Number.isInteger(idx) ? idx : -1; // NaN si no había nada guardado
        actualizarEtiqueta();
        marcarSlotCargado();
    }

    function limpiarCargada() { setCargada("", -1); }
    function nombreCargado() { return cargadaNombre; }
    function indiceCargado() { return cargadaIdx; }

    function leer() {
        try {
            const v = JSON.parse(localStorage.getItem("SaveStates")) || [];
            return Array.from({ length: MAX }, (_, i) => v[i] || null);
        } catch (e) {
            return Array(MAX).fill(null);
        }
    }

    function escribir(slots) {
        localStorage.setItem("SaveStates", JSON.stringify(slots));
    }

    function boton(nombreIcono, title) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn-ss";
        b.innerHTML = icono(nombreIcono);
        b.title = title;
        return b;
    }

    // sinPreguntar lo usa el comando `ss` de la consola: ahí el nombre se
    // escribe a propósito, así que pedir confirmación estorba.
    function guardar(i, nombre, sinPreguntar) {
        Ruta.sincronizar();
        const slots = leer();
        if (!sinPreguntar && slots[i]
            && !confirm(`¿Sobreescribir el savestate "${slots[i].nombre}" con la ruta actual?`)) {
            return false;
        }
        slots[i] = {
            nombre: (nombre || "").trim() || ("Slot " + (i + 1)),
            ruta: document.getElementById("nodosm").value,
            inicial: document.getElementById("inicial").value,
            viajes: document.getElementById("viajes").value,
            manual: document.getElementById("chkManual").checked
        };
        escribir(slots);
        setCargada(slots[i].nombre, i);
        render();
        showMessageGuardando();
        return true;
    }

    function cargar(i) {
        const slot = leer()[i];
        if (!slot) return;
        document.getElementById("inicial").value = slot.inicial || "ILIYA";
        document.getElementById("viajes").value = slot.viajes || 3;
        document.getElementById("chkManual").checked = !!slot.manual;
        document.getElementById("chkManual").dispatchEvent(new Event("change"));
        Ruta.cargarTexto(slot.ruta);
        setCargada(slot.nombre, i);
    }

    function render() {
        const ul = document.getElementById("savestates");
        if (!ul) return;
        const slots = leer();
        ul.innerHTML = "";
        slots.forEach((slot, i) => {
            const li = document.createElement("li");
            li.className = "savestate";

            const inp = document.createElement("input");
            inp.type = "text";
            inp.maxLength = 24;
            inp.placeholder = "Slot " + (i + 1) + " (vacío)";
            inp.value = slot ? slot.nombre : "";

            const bG = boton("guardar", "Guardar acá la ruta actual");
            bG.onclick = function () { guardar(i, inp.value); };

            const bC = boton("carpeta", slot ? "Cargar: " + slot.nombre : "Slot vacío");
            bC.onclick = function () { cargar(i); };
            bC.disabled = !slot;

            const bX = boton("tacho", "Borrar este savestate");
            bX.onclick = function () {
                const s = leer();
                if (s[i] && !confirm(`¿Borrar el savestate "${s[i].nombre}"?`)) return;
                if (i === cargadaIdx) limpiarCargada();
                s[i] = null;
                escribir(s);
                render();
            };
            bX.disabled = !slot;

            li.append(inp, bG, bC, bX);
            ul.append(li);
        });
        actualizarEtiqueta();
        marcarSlotCargado();
    }

    // leer/cargar/guardar salen afuera para los comandos load, loadr y ss
    return { render, setCargada, limpiarCargada, nombreCargado, indiceCargado, leer, cargar, guardar, MAX };
})();
window.SaveStates = SaveStates;
