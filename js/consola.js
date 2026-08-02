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

    // Resuelve un nombre de nodo, informando el error si no se puede.
    // Devuelve el título exacto, o null.
    function resolverNodo(texto, cmd) {
        if (typeof nodosDic === "undefined" || !Object.keys(nodosDic).length) {
            error(`${cmd}: todavía no se cargaron los nodos`);
            return null;
        }
        const r = buscar(texto, Object.keys(nodosDic));
        if (r.estado === "ninguno") {
            error(`${cmd}: nodo desconocido: "${texto}"`);
            return null;
        }
        if (r.estado === "ambiguo") {
            error(`${cmd}: "${texto}" es ambiguo, coincide con ${r.candidatos.length} nodos:`);
            linea("  " + r.candidatos.slice(0, 12).join(", ")
                + (r.candidatos.length > 12 ? ", …" : ""));
            return null;
        }
        return r.valor;
    }

    // Parte los argumentos en dos nombres. Con coma se respetan los nombres
    // de varias palabras ("dist solas chico, orffs"); sin coma tienen que ser
    // exactamente dos palabras.
    function dosNodos(args, cmd) {
        const crudo = args.join(" ");
        let partes;
        if (crudo.includes(",")) partes = crudo.split(",").map(s => s.trim()).filter(Boolean);
        else partes = args;
        if (partes.length !== 2) {
            error(`${cmd}: hacen falta dos nodos`);
            error(`uso: ${cmd} <A> <B>   ·   con nombres de varias palabras: ${cmd} <A>, <B>`);
            return null;
        }
        const a = resolverNodo(partes[0], cmd);
        if (!a) return null;
        const b = resolverNodo(partes[1], cmd);
        if (!b) return null;
        return [a, b];
    }

    // Lee un número de un argumento, con rango. Devuelve null si algo falla
    // (ya deja el error impreso).
    function leerNumero(txt, min, max, cmd, que) {
        const n = parseFloat(txt);
        if (isNaN(n)) { error(`${cmd}: ${que} tiene que ser un número, no "${txt}"`); return null; }
        if (n < min || n > max) { error(`${cmd}: ${que} tiene que estar entre ${min} y ${max} (recibí ${n})`); return null; }
        return n;
    }

    // ---- autocompletado con TAB ----
    // Prefijo común más largo de una lista (lo que bash completa cuando hay
    // varios candidatos), respetando las mayúsculas del primero.
    function prefijoComun(lista) {
        if (!lista.length) return "";
        let p = lista[0];
        for (const s of lista) {
            let i = 0;
            while (i < p.length && i < s.length && p[i].toUpperCase() === s[i].toUpperCase()) i++;
            p = p.slice(0, i);
        }
        return p;
    }

    const nombresSavestates = () =>
        SaveStates.leer().filter(Boolean).map(s => s.nombre);
    const nombresNodos = () =>
        (typeof nodosDic === "undefined" ? [] : Object.keys(nodosDic));

    // Aplica el resultado: completa solo, o completa lo común y lista el resto.
    // A diferencia de bash, lista en el primer TAB en vez del segundo.
    function aplicarCompletado(cands, parcial, set) {
        if (!cands.length) return;
        if (cands.length === 1) { set(cands[0] + " "); return; }
        const comun = prefijoComun(cands);
        if (comun.length > parcial.length) set(comun);
        linea(cands.join("   "), "eco");
    }

    function autocompletar() {
        const val = entrada.value;
        const cab = val.match(/^(\s*\S+\s+)([\s\S]*)$/);

        // primera palabra todavía sin cerrar: se completa el comando
        if (!cab) {
            const t = val.trim().toLowerCase();
            const cands = Object.keys(comandos).filter(c => c.startsWith(t)).sort();
            aplicarCompletado(cands, t, nuevo => { entrada.value = nuevo; });
            return;
        }

        const cabecera = cab[1];
        const resto = cab[2];
        const cmd = comandos[cabecera.trim().toLowerCase()];
        if (!cmd || !cmd.completar) return;
        const lista = cmd.completar() || [];
        if (!lista.length) return;

        // con comas se completa lo que va después de la última (los nombres de
        // nodo tienen espacios, así que no sirve cortar por palabra)
        const iComa = resto.lastIndexOf(",");
        const antes = iComa === -1 ? "" : resto.slice(0, iComa + 1) + " ";
        let parcial = (iComa === -1 ? resto : resto.slice(iComa + 1)).replace(/^\s+/, "");

        let cands = lista.filter(x => norm(x).startsWith(norm(parcial)));
        // sin coma y sin coincidencias, se prueba con la última palabra sola:
        // es el caso de "dist iliya orf" -> ORFFS
        if (!cands.length && iComa === -1 && /\s/.test(parcial)) {
            const corte = parcial.lastIndexOf(" ");
            const ultima = parcial.slice(corte + 1);
            cands = lista.filter(x => norm(x).startsWith(norm(ultima)));
            if (cands.length) {
                const previo = parcial.slice(0, corte + 1);
                aplicarCompletado(cands, ultima, n => { entrada.value = cabecera + previo + n; });
                return;
            }
        }
        aplicarCompletado(cands, parcial, n => { entrada.value = cabecera + antes + n; });
    }

    function addNodosCMD(args)
    {
        if (!args.length) {
            error("add: falta el nombre del nodo");
            error("uso: add <nodo>…   ·   varios nombres separados por coma");
            error("     add sep agrega un separador (corta el viaje en Modo Manual)");
            return;
        }
        const pedidos = args.join(" ").includes(",")
            ? args.join(" ").split(",").map(s => s.trim()).filter(Boolean)
            : args;
        let sumados = 0, separadores = 0;
        for (const p of pedidos) {
            // SEP no es un nodo: es el separador que corta el viaje
            if (norm(p) === "SEP") {
                Ruta.agregar("SEP");
                separadores++;
                continue;
            }
            const t = resolverNodo(p, "add");
            if (!t) continue;
            if (Ruta.planeados().includes(t)) { linea(`  ${t} ya estaba en la ruta`); continue; }
            Ruta.agregar(t);
            sumados++;
        }
        if (sumados || separadores) {
            const partes = [];
            if (sumados) partes.push(`${sumados} nodo${sumados > 1 ? "s" : ""}`);
            if (separadores) partes.push(`${separadores} separador${separadores > 1 ? "es" : ""}`);
            ok(`Agregado: ${partes.join(" y ")}. Ruta: ${Ruta.planeados().length} nodos.`);
        }
    }
    // ---- comandos ----
    const comandos = {
        help: {
            uso: "help",
            ayuda: "muestra esta lista",
            correr() {
                linea("Comandos disponibles:");
                Object.keys(comandos).sort().forEach(n => {
                    linea("  " + comandos[n].uso.padEnd(28) + comandos[n].ayuda);
                });
                linea("");
                linea("TAB autocompleta comandos, nodos y savestates.");
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
            completar: nombresSavestates,
            correr(args) { cargarSavestate(args, "load"); }
        },

        loadr: {
            uso: "loadr <ruta>",
            ayuda: "igual que load, y además calcula los viajes",
            completar: nombresSavestates,
            correr(args) {
                if (!cargarSavestate(args, "loadr")) return;
                const btn = document.getElementById("btnmateriales");
                if (!btn) { error("loadr: no se encontró el botón Calcular viaje/s"); return; }
                btn.click();
                // con más de 9 nodos el cálculo pasa por el cache y es asíncrono,
                // así que puede no haber resultado todavía en esta misma línea
                const n = (typeof resultadoViajes !== "undefined" && resultadoViajes.length) || 0;
                if (n) ok(`Viajes calculados: ${n}.`);
                else ok("Calculando viajes…");
            }
        },

        find: {
            uso: "find <texto>",
            ayuda: "lista los nodos cuyo nombre contenga el texto",
            completar: nombresNodos,
            correr(args) {
                if (!args.length) {
                    error("find: falta el texto a buscar");
                    error("uso: find <texto>");
                    return;
                }
                if (typeof nodosDic === "undefined" || !Object.keys(nodosDic).length) {
                    error("find: todavía no se cargaron los nodos");
                    return;
                }
                const t = norm(args.join(" "));
                const hits = Object.keys(nodosDic).filter(n => norm(n).includes(t)).sort();
                if (!hits.length) { error(`find: ningún nodo contiene "${args.join(" ")}"`); return; }
                const planeados = new Set(typeof Ruta !== "undefined" ? Ruta.planeados() : []);
                ok(`${hits.length} nodo${hits.length > 1 ? "s" : ""}:`);
                hits.forEach(n => linea(`  ${n}${planeados.has(n) ? "   (en la ruta)" : ""}`));
            }
        },

        dist: {
            uso: "dist <A> <B>",
            ayuda: "distancia y tiempo entre dos nodos, sin tocar la ruta",
            completar: nombresNodos,
            correr(args) {
                if (!args.length) {
                    error("dist: faltan los nodos");
                    error("uso: dist <A> <B>   ·   con nombres de varias palabras: dist <A>, <B>");
                    return;
                }
                const par = dosNodos(args, "dist");
                if (!par) return;
                const [ta, tb] = par;
                if (ta === tb) { error("dist: son el mismo nodo"); return; }
                const A = nodosDic[ta], B = nodosDic[tb];
                const d = dist2(A.x, A.y, B.x, B.y);
                const retr = retrasoEntre(ta, tb);
                const { vel, acc } = Navegacion.stats();
                const t = Navegacion.estimarSegundos(d, vel, acc, retr);
                const medido = tieneRetrasoMedido(ta, tb);
                ok(`${ta} → ${tb}`);
                linea(`  distancia en línea recta: ${Math.round(d)} unidades`);
                linea(`  tiempo estimado:          ${Navegacion.fmt(t)}   (vel ${Math.round(vel)}%, acel ${Math.round(acc)}% efectivas)`);
                linea(medido
                    ? `  retraso medido:           ${retr}`
                    : `  sin retraso medido: el tiempo real puede diferir`);
            }
        },

        add: {
            uso: "add <nodo>…",
            ayuda: "agrega nodos a la ruta planeada (sep = separador de viaje)",
            completar: () => ["SEP"].concat(nombresNodos()),
            correr(args) {
                addNodosCMD(args);
            }
        },

        addr: {
            uso: "addr <nodo>…",
            ayuda: "agrega nodos a la ruta planeada (sep = separador de viaje) y genera el viaje",
            completar: () => ["SEP"].concat(nombresNodos()),
            correr(args) {
                addNodosCMD(args);
                const btn = document.getElementById("btnmateriales");
                if (!btn) { error("addr: no se encontró el botón Calcular viaje/s"); return; }
                btn.click();
            }
        },

        viajeadd: {
            uso: "viajeadd <n> <ant> <nuevo>",
            ayuda: "inserta un nodo en un viaje, después de otro (_ = al principio)",
            completar: nombresNodos,
            correr(args) {
                const ayuda = () => {
                    error("uso: viajeadd <n° viaje> <nodo anterior> <nodo nuevo>");
                    error("     el nodo anterior puede ser _ para insertar al principio");
                    error("     con nombres de varias palabras: viajeadd 1 ORFFS, SOLAS CHICO");
                };
                if (!args.length) { error("viajeadd: faltan argumentos"); ayuda(); return; }
                if (typeof resultadoViajes === "undefined" || !resultadoViajes.length) {
                    error("viajeadd: no hay viajes calculados");
                    return;
                }
                const n = parseInt(args[0], 10);
                if (isNaN(n)) {
                    error(`viajeadd: "${args[0]}" no es un número de viaje`);
                    ayuda();
                    return;
                }
                if (n < 1 || n > resultadoViajes.length) {
                    error(`viajeadd: el viaje ${n} no existe (hay ${resultadoViajes.length})`);
                    return;
                }

                // los nombres pueden llevar espacios: con coma se parten ahí,
                // y sin coma tienen que ser exactamente dos palabras
                const resto = args.slice(1).join(" ");
                const partes = resto.includes(",")
                    ? resto.split(",").map(s => s.trim()).filter(Boolean)
                    : args.slice(1);
                if (partes.length !== 2) {
                    error(`viajeadd: hacen falta el nodo anterior y el nuevo (recibí ${partes.length})`);
                    ayuda();
                    return;
                }
                const [anterior, nuevo] = partes;

                const titulo = resolverNodo(nuevo, "viajeadd");
                if (!titulo) return;
                const v = resultadoViajes[n - 1];
                if (v.some(x => x.titulo === titulo)) {
                    error(`viajeadd: ${titulo} ya está en el viaje ${n}`);
                    return;
                }

                // v = [inicial, parada1, …, paradaN, inicial]
                const paradas = v.slice(1, v.length - 1);
                let pos, dondeTexto;
                if (anterior === "_") {
                    pos = 1;
                    dondeTexto = "al principio";
                } else {
                    const r = buscar(anterior, paradas.map(x => x.titulo));
                    if (r.estado === "ninguno") {
                        error(`viajeadd: "${anterior}" no es una parada del viaje ${n}`);
                        linea("  paradas: " + (paradas.map(x => x.titulo).join(", ") || "(ninguna)"));
                        return;
                    }
                    if (r.estado === "ambiguo") {
                        error(`viajeadd: "${anterior}" es ambiguo dentro del viaje ${n}: ${r.candidatos.join(", ")}`);
                        return;
                    }
                    // +1 por el nodo inicial, +1 más para quedar DESPUÉS de él
                    pos = paradas.findIndex(x => x.titulo === r.valor) + 2;
                    dondeTexto = "después de " + r.valor;
                }

                v.splice(pos, 0, nodosDic[titulo]);
                refrescarViajes();
                ok(`${titulo} agregado al viaje ${n}, ${dondeTexto}.`);
            }
        },

        rm: {
            uso: "rm <nodo>…",
            ayuda: "quita nodos de la ruta planeada",
            completar: () => (typeof Ruta === "undefined" ? [] : Ruta.planeados()),
            correr(args) {
                if (!args.length) {
                    error("rm: falta el nombre del nodo");
                    error("uso: rm <nodo>…   ·   varios nombres separados por coma");
                    return;
                }
                const planeados = Ruta.planeados();
                if (!planeados.length) { error("rm: la ruta planeada está vacía"); return; }
                const pedidos = args.join(" ").includes(",")
                    ? args.join(" ").split(",").map(s => s.trim()).filter(Boolean)
                    : args;
                let quitados = 0;
                for (const p of pedidos) {
                    // se busca solo entre los planeados: "rm orf" saca ORFFS
                    const r = buscar(p, Ruta.planeados());
                    if (r.estado === "ninguno") { error(`rm: "${p}" no está en la ruta planeada`); continue; }
                    if (r.estado === "ambiguo") {
                        error(`rm: "${p}" es ambiguo dentro de la ruta: ${r.candidatos.join(", ")}`);
                        continue;
                    }
                    Ruta.quitar(r.valor);
                    quitados++;
                }
                if (quitados) ok(`Quitado${quitados > 1 ? "s" : ""} ${quitados} nodo${quitados > 1 ? "s" : ""}. Ruta: ${Ruta.planeados().length}.`);
            }
        },

        ship: {
            uso: "ship <vel> <acel>",
            ayuda: "cambia velocidad y aceleración del barco",
            correr(args) {
                const iv = document.getElementById("barcoVel");
                const ia = document.getElementById("barcoAcc");
                if (!args.length) {
                    const s = Navegacion.stats();
                    ok(`Barco: velocidad ${iv.value}%, aceleración ${ia.value}%`);
                    linea(`  efectivas con maestría y diario: ${Math.round(s.vel)}% / ${Math.round(s.acc)}%`);
                    linea("  uso: ship <vel> <acel>");
                    return;
                }
                if (args.length !== 2) {
                    error(`ship: hacen falta dos valores (velocidad y aceleración), recibí ${args.length}`);
                    error("uso: ship <vel> <acel>");
                    return;
                }
                const v = leerNumero(args[0], 50, 300, "ship", "la velocidad");
                if (v === null) return;
                const a = leerNumero(args[1], 50, 300, "ship", "la aceleración");
                if (a === null) return;
                iv.value = v; ia.value = a;
                iv.dispatchEvent(new Event("input", { bubbles: true }));
                ia.dispatchEvent(new Event("input", { bubbles: true }));
                const s = Navegacion.stats();
                ok(`Barco: ${v}% / ${a}%  →  efectivas ${Math.round(s.vel)}% / ${Math.round(s.acc)}%`);
                linea("  los viajes ya calculados no se rehacen: volvé a calcular para ver los tiempos nuevos");
            }
        },

        mastery: {
            uso: "mastery <n>",
            ayuda: "cambia el % de maestría (se suma a vel y acel)",
            correr(args) {
                const inp = document.getElementById("barcoMaestria");
                if (!args.length) {
                    ok(`Maestría: ${inp.value}%   (la fórmula se calibró con ${Modelo.MAESTRIA_BASE}%)`);
                    linea("  uso: mastery <n>");
                    return;
                }
                const n = leerNumero(args[0], 0, 100, "mastery", "la maestría");
                if (n === null) return;
                inp.value = n;
                inp.dispatchEvent(new Event("input", { bubbles: true }));
                const s = Navegacion.stats();
                ok(`Maestría: ${n}%  →  efectivas ${Math.round(s.vel)}% / ${Math.round(s.acc)}%`);
            }
        },

        vol: {
            uso: "vol <0-300>",
            ayuda: "cambia el volumen de la alarma",
            correr(args) {
                const sl = document.getElementById("volAlarma");
                if (!args.length) { ok(`Volumen de alarma: ${sl.value}%`); linea("  uso: vol <0-300>"); return; }
                const n = leerNumero(args[0], 0, 300, "vol", "el volumen");
                if (n === null) return;
                sl.value = n;
                sl.dispatchEvent(new Event("input", { bubbles: true })); // sin sonar la prueba
                ok(n === 0 ? "Volumen de alarma: 0% (silencio)" : `Volumen de alarma: ${n}%`);
            }
        },

        done: {
            uso: "done",
            ayuda: "marca ⚓ el tramo en curso (o el próximo pendiente)",
            correr() {
                if (typeof completarTramoActual !== "function") { error("done: no se encontró la acción"); return; }
                const destino = completarTramoActual();
                if (destino === null) {
                    error("done: no hay ningún tramo pendiente");
                    error("      calculá los viajes, o usá `complete` si querés marcar el viaje entero");
                    return;
                }
                ok(`Tramo hacia ${destino} marcado como terminado.`);
            }
        },

        eta: {
            uso: "eta",
            ayuda: "tiempos restantes por viaje y total",
            correr() {
                if (typeof resumenTiempos !== "function") { error("eta: no se encontró la acción"); return; }
                const r = resumenTiempos();
                if (!r) { error("eta: no hay viajes calculados"); return; }
                r.viajes.forEach(v => {
                    linea(v.completo
                        ? `  Viaje ${v.n}: COMPLETADO   (${v.tramos} tramos, ${Navegacion.fmt(v.total)})`
                        : `  Viaje ${v.n}: ${Navegacion.fmt(v.restante)} restantes de ${Navegacion.fmt(v.total)}   (${v.tramos} tramos)`);
                });
                linea("");
                if (r.restante <= 0) ok(`Todo completado. Total del recorrido: ${Modelo.fmtHMS(r.total)}`);
                else ok(`Restante: ${Modelo.fmtHMS(r.restante)}   ·   total: ${Modelo.fmtHMS(r.total)}`);
            }
        },

        nota: {
            uso: "nota [texto]",
            ayuda: "agrega una línea con la hora a la Nota (sin texto, la muestra)",
            correr(args) {
                const ta = document.getElementById("nota");
                if (!ta) { error("nota: no se encontró el panel de Nota"); return; }
                if (!args.length) {
                    const txt = ta.value.trim();
                    if (!txt) { ok("La nota está vacía."); linea("  uso: nota <texto>"); return; }
                    ok("Nota:");
                    txt.split("\n").forEach(l => linea("  " + l));
                    return;
                }
                const hora = new Date().toLocaleTimeString("es-AR",
                    { hour: "2-digit", minute: "2-digit", hour12: false });
                const nueva = `${hora}  ${args.join(" ")}`;
                ta.value = ta.value.trim() ? ta.value.replace(/\s*$/, "") + "\n" + nueva : nueva;
                ok("Agregado a la nota: " + nueva);
                linea("  acordate de guardar con `save`");
            }
        },

        ss: {
            uso: "ss <nombre> | ss list",
            ayuda: "guarda la ruta actual en un savestate, o lista los guardados",
            completar: () => ["list"].concat(nombresSavestates()),
            correr(args) {
                if (!args.length) {
                    error("ss: falta el nombre del savestate");
                    error("uso: ss <nombre>   ·   ss list para ver los guardados");
                    return;
                }
                if (args.length === 1 && args[0].toLowerCase() === "list") {
                    listarSavestates();
                    return;
                }
                const nombre = args.join(" ").trim();
                const slots = SaveStates.leer();
                // se pisa el que ya tenga ese nombre; si no, va al primer libre
                let i = slots.findIndex(s => s && norm(s.nombre) === norm(nombre));
                const pisando = i !== -1;
                if (!pisando) i = slots.findIndex(s => !s);
                if (i === -1) {
                    error(`ss: no hay slots libres (${slots.length} ocupados)`);
                    error("    borrá uno desde la lista, o usá el nombre de uno existente para pisarlo");
                    listarSavestates();
                    return;
                }
                if (!Ruta.planeados().length) {
                    error("ss: la ruta planeada está vacía, no hay nada que guardar");
                    return;
                }
                SaveStates.guardar(i, nombre, true);
                ok(pisando
                    ? `Savestate "${nombre}" actualizado (slot ${i + 1}).`
                    : `Ruta guardada como "${nombre}" (slot ${i + 1}).`);
            }
        },

        goto: {
            uso: "goto <nodo>",
            ayuda: "centra el mapa en un nodo (basta una parte)",
            completar: nombresNodos,
            correr(args) {
                if (!args.length) {
                    error("goto: falta el nombre del nodo");
                    error("uso: goto <nodo>");
                    return;
                }
                const titulo = resolverNodo(args.join(" "), "goto");
                if (!titulo) return;
                if (typeof centrarEnNodo !== "function") {
                    error("goto: el mapa todavía no está listo");
                    return;
                }
                centrarEnNodo(nodosDic[titulo]);
                ok(`Mapa centrado en ${titulo}.`);
            }
        }
    };

    // Carga un savestate por nombre. Devuelve true si lo encontró y lo cargó.
    // La comparte `load` con `loadr`, que además dispara el cálculo.
    function cargarSavestate(args, cmd) {
        if (!args.length) {
            error(`${cmd}: falta el nombre de la ruta`);
            error(`uso: ${cmd} <ruta>`);
            listarSavestates();
            return false;
        }
        const nombre = args.join(" ");
        const slots = SaveStates.leer()
            .map((s, i) => (s ? { slot: i, nombre: s.nombre } : null))
            .filter(Boolean);
        if (!slots.length) {
            error(`${cmd}: no hay savestates guardados`);
            return false;
        }
        const r = buscar(nombre, slots, s => s.nombre);
        if (r.estado === "ninguno") {
            error(`${cmd}: ningún savestate coincide con "${nombre}"`);
            listarSavestates();
            return false;
        }
        if (r.estado === "ambiguo") {
            error(`${cmd}: "${nombre}" es ambiguo, coincide con ${r.candidatos.length} savestates:`);
            r.candidatos.forEach(s => linea(`  ${s.nombre}  (slot ${s.slot + 1})`));
            return false;
        }
        SaveStates.cargar(r.valor.slot);
        ok(`Cargado: ${r.valor.nombre}  (slot ${r.valor.slot + 1})`);
        return true;
    }

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
            if (e.key === "Tab") {
                e.preventDefault(); // que no se vaya el foco del campo
                autocompletar();
                entrada.setSelectionRange(entrada.value.length, entrada.value.length);
                return;
            }
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
