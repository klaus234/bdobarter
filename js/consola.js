// ============================================
// CONSOLA
// Overlay semitransparente que se abre y cierra con la tecla | (la que está
// a la izquierda del 1 en el teclado español latinoamericano, la misma del
// CS 1.6). Los errores imitan el tono de bash: dicen qué faltó y cómo se usa.
// ============================================
const Consola = (function () {
    let panel, salida, entrada;
    const historial = [];   // comandos de esta sesión, del más viejo al más nuevo
    let posHist = -1;       // -1 = escribiendo algo nuevo, 0+ = navegando historial
    let borrador = "";      // lo que había escrito antes de empezar a navegar

    // ---- salida ----
    function linea(texto, clase) {
        const p = document.createElement("div");
        p.className = "consola-linea" + (clase ? " " + clase : "");
        p.textContent = texto;
        salida.appendChild(p);
        salida.scrollTop = salida.scrollHeight;
    }
    const eco = t => linea(t, "eco");
    const ok = t => linea(t, "ok");
    const error = t => linea(t, "error");

    // ---- utilidades ----
    const norm = s => (s || "").trim().toUpperCase();

    // Búsqueda tolerante, sin distinguir mayúsculas, en tres etapas: nombre
    // exacto, después por prefijo (ej: "noct" -> "Nocturna") y por último
    // buscando el texto en cualquier parte (ej: "margoria" -> "Ruta 1
    // Margoria"). Se queda con la primera etapa que dé un único resultado.
    // Devuelve {estado: "unico"|"ninguno"|"ambiguo", valor, candidatos}
    function buscar(texto, lista, clave) {
        const t = norm(texto);
        const nombre = x => norm(clave ? clave(x) : x);
        const exacto = lista.filter(x => nombre(x) === t);
        if (exacto.length === 1) return { estado: "unico", valor: exacto[0] };

        const empiezan = lista.filter(x => nombre(x).startsWith(t));
        if (empiezan.length === 1) return { estado: "unico", valor: empiezan[0] };

        const contienen = lista.filter(x => nombre(x).includes(t));
        if (contienen.length === 1) return { estado: "unico", valor: contienen[0] };

        // se informa el conjunto más chico que no esté vacío
        const candidatos = empiezan.length ? empiezan : contienen;
        if (!candidatos.length) return { estado: "ninguno", candidatos: [] };
        return { estado: "ambiguo", candidatos };
    }

    // ---- comandos ----
    const comandos = {
        help: {
            uso: "help",
            ayuda: "muestra esta lista",
            correr() {
                linea("Comandos disponibles:");
                Object.keys(comandos).sort().forEach(n => {
                    linea("  " + comandos[n].uso.padEnd(22) + comandos[n].ayuda);
                });
                linea("");
                linea("Flechas ↑ ↓ para repetir comandos. | o Esc para cerrar.");
            }
        },

        clear: {
            uso: "clear",
            ayuda: "limpia la consola",
            correr() { salida.innerHTML = ""; }
        },

        reset: {
            uso: "reset",
            ayuda: "borra la ruta planeada y los viajes calculados",
            correr() {
                if (typeof borrarTodo !== "function") {
                    error("reset: no se encontró la acción de borrado");
                    return;
                }
                borrarTodo();
                ok("Ruta planeada y viajes calculados borrados.");
            }
        },

        save: {
            uso: "save",
            ayuda: "guarda el estado (igual que el botón Guardar Estado)",
            correr() {
                const btn = document.getElementById("guardar");
                if (!btn) { error("save: no se encontró el botón Guardar Estado"); return; }
                btn.click();
                ok("Estado guardado.");
            }
        },

        complete: {
            uso: "complete",
            ayuda: "marca el viaje activo como completado",
            correr() {
                if (typeof completarViajeActivo !== "function") {
                    error("complete: no se encontró la acción");
                    return;
                }
                const r = completarViajeActivo();
                if (r === null) {
                    error("complete: no hay ningún viaje activo");
                    error("        calculá los viajes y hacé click en el que quieras marcar");
                    return;
                }
                if (r.total === 0) { error("complete: el viaje activo no tiene tramos"); return; }
                if (r.cambiados === 0) ok(`El viaje ${r.viaje} ya estaba completo (${r.total} tramos).`);
                else ok(`Viaje ${r.viaje} completado: ${r.cambiados} de ${r.total} tramos marcados.`);
            }
        },

        load: {
            uso: "load <ruta>",
            ayuda: "carga un savestate por nombre (basta una parte)",
            correr(args) {
                if (!args.length) {
                    error("load: falta el nombre de la ruta");
                    error("uso: load <ruta>");
                    listarSavestates();
                    return;
                }
                const nombre = args.join(" ");
                const slots = SaveStates.leer()
                    .map((s, i) => (s ? { slot: i, nombre: s.nombre } : null))
                    .filter(Boolean);
                if (!slots.length) {
                    error(`load: no hay savestates guardados`);
                    return;
                }
                const r = buscar(nombre, slots, s => s.nombre);
                if (r.estado === "ninguno") {
                    error(`load: ningún savestate coincide con "${nombre}"`);
                    listarSavestates();
                    return;
                }
                if (r.estado === "ambiguo") {
                    error(`load: "${nombre}" es ambiguo, coincide con ${r.candidatos.length} savestates:`);
                    r.candidatos.forEach(s => linea(`  ${s.nombre}  (slot ${s.slot + 1})`));
                    return;
                }
                SaveStates.cargar(r.valor.slot);
                ok(`Cargado: ${r.valor.nombre}  (slot ${r.valor.slot + 1})`);
            }
        },

        goto: {
            uso: "goto <nodo>",
            ayuda: "centra el mapa en un nodo (basta una parte)",
            correr(args) {
                if (!args.length) {
                    error("goto: falta el nombre del nodo");
                    error("uso: goto <nodo>");
                    return;
                }
                if (typeof nodosDic === "undefined" || !Object.keys(nodosDic).length) {
                    error("goto: todavía no se cargaron los nodos");
                    return;
                }
                const nombre = args.join(" ");
                const r = buscar(nombre, Object.keys(nodosDic));
                if (r.estado === "ninguno") {
                    error(`goto: nodo desconocido: "${nombre}"`);
                    return;
                }
                if (r.estado === "ambiguo") {
                    error(`goto: "${nombre}" es ambiguo, coincide con ${r.candidatos.length} nodos:`);
                    linea("  " + r.candidatos.slice(0, 12).join(", ")
                        + (r.candidatos.length > 12 ? ", …" : ""));
                    return;
                }
                if (typeof centrarEnNodo !== "function") {
                    error("goto: el mapa todavía no está listo");
                    return;
                }
                centrarEnNodo(nodosDic[r.valor]);
                ok(`Mapa centrado en ${r.valor}.`);
            }
        }
    };

    function listarSavestates() {
        const slots = SaveStates.leer();
        const usados = slots.map((s, i) => (s ? `  ${s.nombre}  (slot ${i + 1})` : null)).filter(Boolean);
        if (!usados.length) { linea("  (no hay savestates guardados)"); return; }
        linea("Savestates disponibles:");
        usados.forEach(l => linea(l));
    }

    // ---- ejecución ----
    function ejecutar(texto) {
        const linea0 = texto.trim();
        eco("> " + linea0);
        if (linea0 === "") return;
        historial.push(linea0);
        const partes = linea0.split(/\s+/);
        const nombre = partes[0].toLowerCase();
        const cmd = comandos[nombre];
        if (!cmd) {
            error(`${nombre}: comando no encontrado`);
            error('escribí "help" para ver los comandos disponibles');
            return;
        }
        try {
            cmd.correr(partes.slice(1));
        } catch (e) {
            error(`${nombre}: falló inesperadamente: ${e.message}`);
            console.error(e);
        }
    }

    // ---- visibilidad ----
    function abierta() { return !!panel && panel.classList.contains("abierta"); }

    function abrir() {
        panel.classList.add("abierta");
        panel.setAttribute("aria-hidden", "false");
        entrada.value = "";
        posHist = -1;
        entrada.focus();
    }

    function cerrar() {
        panel.classList.remove("abierta");
        panel.setAttribute("aria-hidden", "true");
        entrada.blur();
    }

    function alternar() { abierta() ? cerrar() : abrir(); }

    // La tecla varía según el mapa de teclado: en español latinoamericano da
    // "|", en otros "°" o "¬", y el código físico es siempre Backquote (la
    // tecla a la izquierda del 1, la de la consola del CS).
    function esTeclaConsola(e) {
        return e.key === "|" || e.key === "°" || e.key === "¬" || e.code === "Backquote";
    }

    function init() {
        panel = document.getElementById("consola");
        if (!panel) return;
        salida = document.getElementById("consolaSalida");
        entrada = document.getElementById("consolaEntrada");

        linea("Consola · escribí \"help\" para ver los comandos.");

        document.addEventListener("keydown", function (e) {
            if (!esTeclaConsola(e)) return;
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            const enCampo = e.target && e.target.matches && e.target.matches("input, textarea, select");
            // dentro de un campo la tecla se escribe normalmente (ej: la Nota),
            // salvo que el campo sea el de la propia consola
            if (enCampo && e.target !== entrada) return;
            e.preventDefault();
            alternar();
        });

        entrada.addEventListener("keydown", function (e) {
            if (e.key === "Escape") { e.preventDefault(); cerrar(); return; }
            if (e.key === "Enter") {
                e.preventDefault();
                ejecutar(entrada.value);
                entrada.value = "";
                posHist = -1;
                borrador = "";
                return;
            }
            // ↑ ↓ recorren los comandos de esta sesión
            if (e.key === "ArrowUp") {
                e.preventDefault();
                if (!historial.length) return;
                if (posHist === -1) { borrador = entrada.value; posHist = historial.length; }
                if (posHist > 0) posHist--;
                entrada.value = historial[posHist];
                entrada.setSelectionRange(entrada.value.length, entrada.value.length);
                return;
            }
            if (e.key === "ArrowDown") {
                e.preventDefault();
                if (posHist === -1) return;
                posHist++;
                if (posHist >= historial.length) { posHist = -1; entrada.value = borrador; }
                else entrada.value = historial[posHist];
                entrada.setSelectionRange(entrada.value.length, entrada.value.length);
            }
        });

        // click en el fondo del panel: devolver el foco al campo
        panel.addEventListener("mousedown", function (e) {
            if (e.target === entrada) return;
            setTimeout(() => { if (abierta()) entrada.focus(); }, 0);
        });
    }

    return { init, alternar, abierta };
})();
window.Consola = Consola;
