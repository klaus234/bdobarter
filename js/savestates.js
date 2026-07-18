// Módulo SaveStates: rutas guardadas con nombre
// (extraído de index.html sin cambios de lógica)

// ============================================
// MÓDULO SAVESTATES: hasta 5 rutas guardadas con nombre
// Cada slot guarda: nombre, ruta (texto con #o_/#d_), nodo inicial,
// máx nodos por viaje y el flag de modo manual.
// ============================================
const SaveStates = (function () {
    const MAX = 10;

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

    function boton(txt, title) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn-ss";
        b.innerText = txt;
        b.title = title;
        return b;
    }

    function guardar(i, nombre) {
        Ruta.sincronizar();
        const slots = leer();
        if (slots[i] && !confirm(`¿Sobreescribir el savestate "${slots[i].nombre}" con la ruta actual?`)) {
            return;
        }
        slots[i] = {
            nombre: (nombre || "").trim() || ("Slot " + (i + 1)),
            ruta: document.getElementById("nodosm").value,
            inicial: document.getElementById("inicial").value,
            viajes: document.getElementById("viajes").value,
            manual: document.getElementById("chkManual").checked
        };
        escribir(slots);
        render();
        showMessageGuardando();
    }

    function cargar(i) {
        const slot = leer()[i];
        if (!slot) return;
        document.getElementById("inicial").value = slot.inicial || "ILIYA";
        document.getElementById("viajes").value = slot.viajes || 3;
        document.getElementById("chkManual").checked = !!slot.manual;
        Ruta.cargarTexto(slot.ruta);
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

            const bG = boton("💾", "Guardar acá la ruta actual");
            bG.onclick = function () { guardar(i, inp.value); };

            const bC = boton("📂", slot ? "Cargar: " + slot.nombre : "Slot vacío");
            bC.onclick = function () { cargar(i); };
            bC.disabled = !slot;

            const bX = boton("✕", "Borrar este savestate");
            bX.onclick = function () {
                const s = leer();
                if (s[i] && !confirm(`¿Borrar el savestate "${s[i].nombre}"?`)) return;
                s[i] = null;
                escribir(s);
                render();
            };
            bX.disabled = !slot;

            li.append(inp, bG, bC, bX);
            ul.append(li);
        });
    }

    return { render };
})();
window.SaveStates = SaveStates;
