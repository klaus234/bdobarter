// Render de viajes, tiempos por tramo y utilitarios de la lista
// (extraído de index.html sin cambios de lógica)

// ============================================
// FUNCIONES UTILITARIAS
// ============================================

// Distancia total de un viaje. Usa dist2 sobre x/y para que también
// funcione con los viajes del cache (objetos planos sin métodos).
function distanciaViajeXY(viaje) {
    let total = 0;
    for (let i = 0; i < viaje.length - 1; i++) {
        total += dist2(viaje[i].x, viaje[i].y, viaje[i + 1].x, viaje[i + 1].y);
    }
    return total;
}

// Tiempo total estimado de un viaje (incluye la vuelta al inicial, ya que
// el viaje termina en el nodo inicial). Suma el ETA de cada tramo con su
// retraso, usando la velocidad/aceleración actuales del barco.
function tiempoViajeXY(viaje) {
    const { vel, acc } = Navegacion.stats();
    let total = 0;
    for (let i = 0; i < viaje.length - 1; i++) {
        // tramo nulo (mismo nodo, ej: la última parada ES el inicial): no suma
        if (viaje[i].titulo === viaje[i + 1].titulo) continue;
        const retr = retrasoEntre(viaje[i].titulo, viaje[i + 1].titulo);
        total += Navegacion.estimarSegundos(
            dist2(viaje[i].x, viaje[i].y, viaje[i + 1].x, viaje[i + 1].y), vel, acc, retr);
    }
    return total;
}

// Link del tiempo estimado de un tramo a la Calculadora de Retraso, con el
// tramo, el tiempo y los datos del barco ya cargados por GET (los lee el
// bloque de parámetros al final de calculadora_retraso.html).
// El tiempo que va es el ESTIMADO: allá se reemplaza por el real medido.
function urlCalculadoraRetraso(nodoA, nodoB, seg) {
    // van los valores crudos del panel: la calculadora aplica el bono del
    // diario con su propio checkbox, no hay que mandarlo ya sumado
    const c = Navegacion.statsCrudos();
    return "calculadora_retraso.html?" + new URLSearchParams({
        nodoA: nodoA,
        nodoB: nodoB,
        tiempo: Navegacion.fmt(seg),
        vel: c.vel,
        acc: c.acc,
        diario: c.diario ? 1 : 0
    });
}

function showMessageGuardando() {
    setTimeout(function () {
        $("#popupguardando").fadeIn(1000);
        setTimeout(function () {
            $("#popupguardando").fadeOut(1000);
        }, 3000);
    }, 100);
}

function resetearNodosColor() {
    for (let ndo of nodosM) {
        ndo.seleccionado = false;
    }
}

function irNodo() {
    const inodo = nodosDic[this.innerText];
    if (!inodo) return;
    centrarEnNodo(inodo); // definido en mapa_zoom.js: deja el nodo en el centro del canvas
}

function colorearNodo() {
    const nombreNodo = this.parentNode.dataset.titulo;
    for (let ndo of nodosM) {
        if (ndo.titulo === nombreNodo) {
            ndo.seleccionado = !ndo.seleccionado;
            return 0;
        }
    }
    return 1;
}

// ============================================
// EDICIÓN DE LOS VIAJES YA CALCULADOS
// Cada viaje es [inicial, parada1, …, paradaN, inicial]: se puede agregar una
// parada al final (antes de la vuelta), quitarla o reordenarlas arrastrando.
// Como estadoViajesCalculados() guarda los viajes por título, todo esto
// persiste solo al apretar Guardar Estado.
// ============================================

// Progreso visible (⚓ por tramo y nodos marcados), por viaje y por nodo, para
// no perderlo al rehacer la lista. Se indexa por título y no por posición
// porque justamente las posiciones cambian al reordenar.
function leerProgresoViajes() {
    return [...document.querySelectorAll("#outputnodos > li")].map(li => {
        const est = { paradas: {}, vuelta: false };
        li.querySelectorAll(".cboxnodo").forEach(fila => {
            const btn = fila.querySelector(".btn-play");
            const ancla = !!btn && btn.innerText.trim() === "⚓";
            if (fila.classList.contains("fila-vuelta")) { est.vuelta = ancla; return; }
            const cbox = fila.querySelector("input[type=checkbox]");
            est.paradas[fila.dataset.titulo] = { ancla, marcado: !!cbox && cbox.checked };
        });
        return est;
    });
}

function aplicarProgresoViajes(progreso) {
    [...document.querySelectorAll("#outputnodos > li")].forEach((li, i) => {
        const est = progreso[i];
        if (!est) return;
        li.querySelectorAll(".cboxnodo").forEach(fila => {
            const btn = fila.querySelector(".btn-play");
            if (fila.classList.contains("fila-vuelta")) {
                if (est.vuelta && btn) btn.innerText = "⚓";
                return;
            }
            const p = est.paradas[fila.dataset.titulo];
            if (!p) return;
            if (p.ancla && btn) btn.innerText = "⚓";
            const cbox = fila.querySelector("input[type=checkbox]");
            // se asigna sin .click(): el color del nodo en el mapa no cambió
            if (cbox) cbox.checked = p.marcado;
        });
    });
}

// Dónde está el tramo que se está navegando, para poder volver a engancharlo
// después de rehacer la lista. Se anota por viaje + nodo de destino, no por
// posición, porque justamente las posiciones cambian al reordenar.
function ubicarTramoActivo() {
    const btn = typeof Navegacion !== "undefined" && Navegacion.botonActivo();
    if (!btn) return null;
    const fila = btn.closest(".cboxnodo");
    const li = btn.closest("#outputnodos > li");
    if (!fila || !li) return null;
    return {
        viaje: [...document.querySelectorAll("#outputnodos > li")].indexOf(li),
        titulo: fila.dataset.titulo || null,
        vuelta: fila.classList.contains("fila-vuelta")
    };
}

// Rehace la lista después de tocar un viaje, conservando el progreso.
function refrescarViajes() {
    // El tramo en curso apunta a un botón que va a dejar de existir. Antes se
    // cancelaba el viaje entero, pero eso lo cortaba aunque se estuviera
    // editando OTRO viaje: ahora se anota dónde está y se reengancha abajo.
    const activo = ubicarTramoActivo();
    const progreso = leerProgresoViajes();
    const dom = document.getElementById("outputnodos");
    const res = renderizarViajes(resultadoViajes, dom);
    const tot = document.getElementById("totales");
    if (tot) tot.innerText = `${res.nodos} nodos · dist ${Math.round(res.dist)}`;
    aplicarProgresoViajes(progreso);
    if (activo) reengancharTramoActivo(activo);
    actualizarTiempoRestante();
}

// Vuelve a atar el viaje en curso a la fila equivalente de la lista nueva.
// Si esa parada ya no existe (se la quitó), recién ahí se cancela.
function reengancharTramoActivo(ref) {
    const li = [...document.querySelectorAll("#outputnodos > li")][ref.viaje];
    const fila = li && (ref.vuelta
        ? li.querySelector(".cboxnodo.fila-vuelta")
        : [...li.querySelectorAll(".cboxnodo")].find(f => f.dataset.titulo === ref.titulo));
    const btn = fila && fila.querySelector(".btn-play");
    if (!btn) { Navegacion.cancelar(); return; }
    Navegacion.reasignarFila(btn, fila.querySelector("input[type=checkbox]"));
}

// Marca todos los tramos del viaje activo como terminados (⚓), igual que
// hacer click derecho en cada ▶ uno por uno. Devuelve un resumen, o null si
// no hay ningún viaje activo. Lo usa el comando `complete` de la consola.
function completarViajeActivo() {
    const ident = document.querySelector("#outputnodos .identificadorViaje.viajeActivo");
    if (!ident) return null;
    const btns = [...ident.closest("li").querySelectorAll(".btn-play")];
    let cambiados = 0;
    for (const b of btns) {
        if (b.innerText.trim() === "⚓") continue;
        if (Navegacion.botonActivo() === b) Navegacion.cancelar();
        b.innerText = "⚓";
        cambiados++;
        const fila = b.closest(".cboxnodo");
        const cbox = fila && fila.querySelector("input[type=checkbox]");
        if (cbox && !cbox.checked) cbox.click(); // pinta el nodo en el mapa
    }
    actualizarTiempoRestante();
    return { viaje: ident.validx + 1, cambiados: cambiados, total: btns.length };
}

// Marca ⚓ el tramo en curso; si no hay ninguno navegando, el próximo
// pendiente del viaje activo. Devuelve el nombre del destino, o null si no
// quedaba nada por marcar. Lo usa el comando `done` de la consola.
function completarTramoActual() {
    let btn = Navegacion.botonActivo();
    if (btn) Navegacion.cancelar(); // cancelar primero: repone el símbolo del botón
    if (!btn) {
        const ident = document.querySelector("#outputnodos .identificadorViaje.viajeActivo");
        if (!ident) return null;
        btn = [...ident.closest("li").querySelectorAll(".btn-play")]
            .find(b => b.innerText.trim() !== "⚓") || null;
    }
    if (!btn) return null;
    btn.innerText = "⚓";
    const fila = btn.closest(".cboxnodo");
    const cbox = fila && fila.querySelector("input[type=checkbox]");
    if (cbox && !cbox.checked) cbox.click(); // pinta el nodo en el mapa
    actualizarTiempoRestante();
    return (fila && fila.dataset.titulo) || "la vuelta";
}

// Tiempos por viaje y totales. Lee los botones porque son los que llevan el
// progreso (⚓ en los terminados, cuenta atrás en el que está navegando).
// Devuelve null si no hay viajes calculados. Lo usa el comando `eta`.
function resumenTiempos() {
    const lis = [...document.querySelectorAll("#outputnodos > li")]
        .filter(li => li.querySelector(".btn-play"));
    if (!lis.length) return null;
    const restanteDe = (btns) => {
        let t = 0;
        for (const b of btns) {
            const s = b.innerText.trim();
            if (s === "⚓") continue;
            const m = s.match(/^(\d+):(\d\d)$/); // navegando o en pausa
            t += m ? (+m[1]) * 60 + (+m[2]) : (parseFloat(b.dataset.est) || 0);
        }
        return t;
    };
    const viajes = lis.map((li, i) => {
        const btns = [...li.querySelectorAll(".btn-play")];
        return {
            n: i + 1,
            tramos: btns.length,
            total: btns.reduce((s, b) => s + (parseFloat(b.dataset.est) || 0), 0),
            restante: restanteDe(btns),
            completo: btns.every(b => b.innerText.trim() === "⚓")
        };
    });
    return {
        viajes,
        total: viajes.reduce((s, v) => s + v.total, 0),
        restante: viajes.reduce((s, v) => s + v.restante, 0)
    };
}

// Nodos que todavía no están en el viaje (para el selector de "agregar")
function nodosDisponiblesPara(viaje) {
    const usados = new Set(viaje.map(n => n.titulo));
    return Object.keys(nodosDic).filter(t => !usados.has(t)).sort();
}

// ============================================
// RENDERIZADOR DE VIAJES
// ============================================
function renderizarViajes(viajes, contenedor) {
    // los menús del buscador cuelgan del body: al rehacer la lista sus inputs
    // desaparecen pero el menú queda, así que se barren antes de recrearlos
    if (window.jQuery) jQuery("ul.viaje-add-menu").remove();
    contenedor.innerHTML = "";
    let indiceViaje = 0;
    let totalNodos = 0;
    let distTotal = 0;
    let tiempoTotal = 0;

    // Marca un viaje como activo (lo resalta y dibuja su ruta en el mapa).
    // centrar=false cuando viene de un ▶: mover el mapa ahí sería molesto.
    function activarViaje(ident, centrar) {
        recNodos = viajes[ident.validx];
        document.querySelectorAll(".identificadorViaje")
            .forEach(k => k.classList.remove("viajeActivo"));
        ident.classList.add("viajeActivo");
        if (centrar && ident.firstNodoSpan) ident.firstNodoSpan.click();
    }

    for (let rgeneral of viajes) {
        const distViaje = distanciaViajeXY(rgeneral);
        distTotal += distViaje;
        const tViaje = tiempoViajeXY(rgeneral);
        tiempoTotal += tViaje;
        const liGeneral = document.createElement("li");
        const identificador = document.createElement("div");
        identificador.className = "identificadorViaje";
        // base fija + span de restante (se actualiza igual que el total)
        const idBase = document.createElement("span");
        idBase.innerHTML = `Viaje ${indiceViaje + 1} · ${rgeneral.length - 2} nodos · dist ${Math.round(distViaje)} · `
            + icono("reloj") + ` ${Navegacion.fmt(tViaje)}`;
        const idRest = document.createElement("span");
        idRest.className = "viajeRestante";
        identificador.append(idBase, idRest);
        
        if (indiceViaje === 0) {
            identificador.classList.add("viajeActivo");
        }

        identificador.id = `viaje${indiceViaje}`;
        identificador.validx = indiceViaje;

        identificador.onclick = function () {
            activarViaje(this, true);
        };

        liGeneral.append(identificador);

        let firstNodoSpan = undefined;
        const paradas = rgeneral.slice(1, rgeneral.length - 1);
        const idxViaje = indiceViaje; // fijo para los handlers de esta iteración
        paradas.forEach((rnodo, j) => {
            const lit = document.createElement("div");
            lit.className = "cboxnodo";
            lit.dataset.titulo = rnodo.titulo;
            lit.dataset.viaje = idxViaje;
            lit.dataset.parada = j;   // posición dentro de las paradas
            lit.draggable = true;

            // agarradera para reordenar, igual que en la Ruta Planeada
            const grip = document.createElement("span");
            grip.className = "ruta-grip viaje-grip";
            grip.textContent = "⠿";
            grip.title = "Arrastrar para cambiar el orden dentro del viaje";
            grip.setAttribute("aria-hidden", "true");

            const cbox = document.createElement("input");
            cbox.type = "checkbox";
            cbox.onclick = colorearNodo;

            const spn = document.createElement("span");
            spn.innerText = rnodo.titulo;
            spn.onclick = irNodo;

            if (firstNodoSpan === undefined) {
                firstNodoSpan = spn;
            }

            // ▶ = "zarpé hacia este nodo" (desde la parada anterior)
            const origen = rgeneral[j];
            const btnPlay = document.createElement("button");
            btnPlay.type = "button";
            btnPlay.className = "btn-play";
            btnPlay.innerText = "▶";
            btnPlay.dataset.simbolo = "▶";
            const { vel, acc } = Navegacion.stats();
            const retr = retrasoEntre(origen.titulo, rnodo.titulo);
            const est = Navegacion.estimarSegundos(
                dist2(origen.x, origen.y, rnodo.x, rnodo.y), vel, acc, retr);
            btnPlay.dataset.est = est; // segundos, para el "tiempo restante"
            btnPlay.title = `Zarpé de ${origen.titulo} hacia ${rnodo.titulo} · llegada ≈ ${Navegacion.fmt(est)}`
                + (retr !== 0 ? ` · retraso ${retr}` : "");
            const medido = tieneRetrasoMedido(origen.titulo, rnodo.titulo);
            if (medido) btnPlay.classList.add("conRetraso");
            btnPlay.onclick = function () {
                activarViaje(identificador, false); // el viaje de este tramo pasa a ser el activo
                Navegacion.zarpar(origen, rnodo, rnodo.titulo, btnPlay, cbox);
            };
            // click derecho: marcar el tramo como terminado (⚓) sin esperar
            btnPlay.oncontextmenu = function (ev) {
                ev.preventDefault();
                if (Navegacion.botonActivo() === btnPlay) Navegacion.cancelar();
                btnPlay.innerText = "⚓";
                if (cbox && !cbox.checked) cbox.click();
                actualizarTiempoRestante();
            };

            // tiempo estimado del tramo, visible al lado del nombre. Es un link
            // a la Calculadora de Retraso (otra pestaña) con el tramo cargado.
            // Sin retraso medido va subrayado punteado (el dato puede fallar).
            const lnkT = document.createElement("a");
            lnkT.className = "tiempoTramo" + (medido ? "" : " estimado");
            lnkT.href = urlCalculadoraRetraso(origen.titulo, rnodo.titulo, est);
            lnkT.target = "_blank";
            lnkT.rel = "noopener";
            lnkT.innerText = "≈ " + Navegacion.fmt(est);
            lnkT.title = (medido
                ? "Tiempo corregido con un retraso medido para este tramo"
                : "Estimado sin medición: el tiempo real puede diferir")
                + "\nAbrir la Calculadora de Retraso con este tramo cargado";

            // quitar la parada de este viaje (no toca la Ruta Planeada)
            const btnQuitar = document.createElement("button");
            btnQuitar.type = "button";
            btnQuitar.className = "ruta-del viaje-quitar";
            btnQuitar.textContent = "✕";
            btnQuitar.title = "Quitar " + rnodo.titulo + " de este viaje";
            btnQuitar.setAttribute("aria-label", "Quitar " + rnodo.titulo + " de este viaje");
            btnQuitar.onclick = function () {
                resultadoViajes[idxViaje].splice(j + 1, 1); // +1: el [0] es el nodo inicial
                refrescarViajes();
            };

            lit.append(grip);
            lit.append(cbox);
            lit.append(spn);
            lit.append(lnkT);
            lit.append(btnPlay);
            lit.append(btnQuitar);
            liGeneral.append(lit);
            totalNodos++;
        });

        // Fila extra: regreso al nodo inicial. Si la última parada YA ES el
        // nodo inicial, el barco quedó ahí y no hay tramo de vuelta.
        if (paradas.length > 0
            && rgeneral[rgeneral.length - 2].titulo !== rgeneral[rgeneral.length - 1].titulo) {
            const filaV = document.createElement("div");
            filaV.className = "cboxnodo fila-vuelta";
            const origenV = rgeneral[rgeneral.length - 2];
            const destinoV = rgeneral[rgeneral.length - 1];

            const spnV = document.createElement("span");
            spnV.innerHTML = icono("vuelta") + " Vuelta a " + destinoV.titulo;
            spnV.onclick = function () {
                const n = nodosDic[destinoV.titulo];
                if (n) centrarEnNodo(n);
            };

            const btnV = document.createElement("button");
            btnV.type = "button";
            btnV.className = "btn-play";
            btnV.innerText = "◀";
            btnV.dataset.simbolo = "◀";
            const { vel: velV, acc: accV } = Navegacion.stats();
            const retrV = retrasoEntre(origenV.titulo, destinoV.titulo);
            const estV = Navegacion.estimarSegundos(
                dist2(origenV.x, origenV.y, destinoV.x, destinoV.y), velV, accV, retrV);
            btnV.dataset.est = estV;
            btnV.title = `Zarpé de ${origenV.titulo} de vuelta a ${destinoV.titulo} · llegada ≈ ${Navegacion.fmt(estV)}`
                + (retrV !== 0 ? ` · retraso ${retrV}` : "");
            const medidoV = tieneRetrasoMedido(origenV.titulo, destinoV.titulo);
            if (medidoV) btnV.classList.add("conRetraso");
            btnV.onclick = function () {
                activarViaje(identificador, false);
                Navegacion.zarpar(origenV, destinoV, destinoV.titulo, btnV, null);
            };
            btnV.oncontextmenu = function (ev) {
                ev.preventDefault();
                if (Navegacion.botonActivo() === btnV) Navegacion.cancelar();
                btnV.innerText = "⚓";
                actualizarTiempoRestante();
            };

            const lnkTV = document.createElement("a");
            lnkTV.className = "tiempoTramo" + (medidoV ? "" : " estimado");
            lnkTV.href = urlCalculadoraRetraso(origenV.titulo, destinoV.titulo, estV);
            lnkTV.target = "_blank";
            lnkTV.rel = "noopener";
            lnkTV.innerText = "≈ " + Navegacion.fmt(estV);
            lnkTV.title = (medidoV
                ? "Tiempo corregido con un retraso medido para este tramo"
                : "Estimado sin medición: el tiempo real puede diferir")
                + "\nAbrir la Calculadora de Retraso con este tramo cargado";

            filaV.append(spnV);
            filaV.append(lnkTV);
            filaV.append(btnV);
            // La vuelta no se puede quitar, pero sin un hueco del ancho de la
            // ✕ su ◀ se iría al borde y quedaría desalineado con los ▶.
            const hueco = document.createElement("span");
            hueco.className = "viaje-quitar-hueco";
            hueco.setAttribute("aria-hidden", "true");
            filaV.append(hueco);
            liGeneral.append(filaV);
        }

        // Agregar una parada extra al final del viaje (queda antes de la
        // vuelta al nodo inicial). Es adicional a lo que calculó el solver.
        const filaAdd = document.createElement("div");
        filaAdd.className = "viaje-agregar";
        const inpAdd = document.createElement("input");
        inpAdd.type = "text";
        inpAdd.className = "viaje-add";
        inpAdd.placeholder = "＋ agregar parada al final…";
        inpAdd.title = "Escribí para buscar, o hacé click para desplegar la lista";
        inpAdd.setAttribute("autocomplete", "off");
        filaAdd.append(inpAdd);
        liGeneral.append(filaAdd);

        // Inserta la parada si el nombre existe y no está ya en el viaje.
        // Va diferido porque refrescarViajes() rehace la lista y se lleva
        // puesto el propio input desde el que se está llamando.
        const agregarParada = (titulo) => {
            const nodo = nodosDic[(titulo || "").trim().toUpperCase()];
            const v = resultadoViajes[idxViaje];
            if (!nodo || v.some(n => n.titulo === nodo.titulo)) return;
            setTimeout(() => {
                v.splice(v.length - 1, 0, nodo); // antes del regreso al inicial
                refrescarViajes();
            }, 0);
        };

        inpAdd.addEventListener("keydown", e => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            agregarParada(inpAdd.value);
        });

        // Mismo buscador que "Agregar Nodo" (jQuery UI). Con minLength 0 la
        // lista completa se despliega al hacer click, así sirve de las dos
        // formas: escribiendo o eligiendo. El menú se cuelga del body, no del
        // contenedor, porque ".uml1 li" le pisaría el estilo a sus opciones.
        if (window.jQuery && jQuery.fn.autocomplete) {
            jQuery(inpAdd).autocomplete({
                source: nodosDisponiblesPara(rgeneral),
                minLength: 0,
                classes: { "ui-autocomplete": "viaje-add-menu" },
                select: function (ev, ui) {
                    agregarParada(ui.item.value);
                    return false;
                }
            }).on("focus click", function () {
                jQuery(this).autocomplete("search", this.value);
            });
        }

        identificador.firstNodoSpan = firstNodoSpan;
        indiceViaje++;
        contenedor.append(liGeneral);
    }

    // Resumen final: tiempo total de todos los viajes (con vueltas) + restante
    if (viajes.length > 0) {
        const resumen = document.createElement("li");
        resumen.id = "resumenTiempoTotal";
        resumen.innerHTML = icono("reloj")
            + ` Tiempo total (${viajes.length} viaje${viajes.length > 1 ? "s" : ""}, con vueltas): ${Modelo.fmtHMS(tiempoTotal)}`;
        contenedor.append(resumen);

        const restanteLi = document.createElement("li");
        restanteLi.id = "resumenTiempoRestante";
        contenedor.append(restanteLi);
    }

    // reposicionar el puntero de atajos de teclado ("." y ",")
    if (typeof Atajos !== "undefined") Atajos.reset();
    conectarArrastreViajes(contenedor);
    actualizarTiempoRestante();

    return { nodos: totalNodos, dist: distTotal };
}

// ============================================
// REORDENAR PARADAS ARRASTRANDO
// Mismo gesto que la Ruta Planeada (ver js/ruta.js), pero acotado a un viaje:
// una parada no puede saltar a otro viaje ni pasar por delante del nodo
// inicial. Los handlers van delegados en el contenedor y se enganchan una
// sola vez, porque renderizarViajes() rehace todo su contenido.
// ============================================
function conectarArrastreViajes(contenedor) {
    if (contenedor.dataset.arrastreListo) return;
    contenedor.dataset.arrastreListo = "1";

    let origen = null; // {viaje, parada}

    const limpiar = () => contenedor.querySelectorAll(".drop-antes, .drop-despues")
        .forEach(f => f.classList.remove("drop-antes", "drop-despues"));

    // paradas del viaje que se está arrastrando (excluye la fila de vuelta)
    const filasDe = (viaje) => [...contenedor.querySelectorAll(
        `.cboxnodo[data-viaje="${viaje}"]:not(.fila-vuelta)`)];

    function posicionInsercion(viaje, y) {
        const filas = filasDe(viaje);
        for (let i = 0; i < filas.length; i++) {
            const r = filas[i].getBoundingClientRect();
            if (y < r.top + r.height / 2) return i;
        }
        return filas.length;
    }

    contenedor.addEventListener("dragstart", e => {
        const fila = e.target.closest(".cboxnodo[data-parada]");
        if (!fila) return;
        origen = { viaje: +fila.dataset.viaje, parada: +fila.dataset.parada };
        fila.classList.add("dragging");
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            try { e.dataTransfer.setData("text/plain", fila.dataset.titulo); } catch (err) { }
        }
    });

    contenedor.addEventListener("dragend", () => {
        contenedor.querySelectorAll(".dragging").forEach(f => f.classList.remove("dragging"));
        limpiar();
        origen = null;
    });

    contenedor.addEventListener("dragover", e => {
        if (!origen) return;
        const fila = e.target.closest(".cboxnodo[data-parada]");
        if (!fila || +fila.dataset.viaje !== origen.viaje) return; // solo dentro del mismo viaje
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        limpiar();
        const filas = filasDe(origen.viaje);
        const pos = posicionInsercion(origen.viaje, e.clientY);
        if (pos >= filas.length) filas[filas.length - 1].classList.add("drop-despues");
        else filas[pos].classList.add("drop-antes");
    });

    contenedor.addEventListener("dragleave", e => {
        if (!contenedor.contains(e.relatedTarget)) limpiar();
    });

    contenedor.addEventListener("drop", e => {
        if (!origen) return;
        const fila = e.target.closest(".cboxnodo[data-parada]");
        if (!fila || +fila.dataset.viaje !== origen.viaje) return;
        e.preventDefault();
        let pos = posicionInsercion(origen.viaje, e.clientY);
        limpiar();
        const v = resultadoViajes[origen.viaje];
        // +1 en los índices: v[0] es el nodo inicial, las paradas arrancan en 1
        const movido = v.splice(origen.parada + 1, 1)[0];
        if (pos > origen.parada) pos--; // compensar el hueco que dejó
        v.splice(Math.max(0, Math.min(pos, v.length - 2)) + 1, 0, movido);
        origen = null;
        refrescarViajes();
    });
}

// Tiempo restante = suma de los tramos que aún no tienen ancla (⚓). El tramo
// activo aporta su cuenta regresiva (por eso baja cada segundo mientras viajás);
// los completados aportan 0. Cuando están todos completos: "COMPLETADO".
// Borra de la pantalla los viajes ya calculados y su progreso. El localStorage
// no se toca acá: se actualiza al apretar Guardar Estado (igual que la ruta).
function limpiarViajesCalculados() {
    if (typeof Navegacion !== "undefined") Navegacion.cancelar(); // aviso en curso
    resultadoViajes = [];
    recNodos = [];          // saca la línea roja del mapa
    resetearNodosColor();   // y los nodos marcados en verde
    const dom1 = document.getElementById("outputnodos");
    if (dom1) dom1.innerHTML = "";
    const tot = document.getElementById("totales");
    if (tot) tot.innerText = "0";
    if (typeof Atajos !== "undefined") Atajos.reset();
}

// ============================================
// PERSISTENCIA DE LOS VIAJES CALCULADOS
// Guarda los viajes (por título) y el progreso: tramos completados (⚓) y
// checkboxes marcados, para poder retomar la ruta donde se dejó.
// ============================================
function estadoViajesCalculados() {
    if (!Array.isArray(resultadoViajes) || resultadoViajes.length === 0) return null;
    return {
        viajes: resultadoViajes.map(v => v.map(n => n.titulo)),
        anclas: [...document.querySelectorAll("#outputnodos .btn-play")]
            .map(b => b.innerText.trim() === "⚓"),
        checks: [...document.querySelectorAll("#outputnodos .cboxnodo input[type=checkbox]")]
            .map(c => c.checked)
    };
}

// Rehidrata lo guardado por estadoViajesCalculados(). Requiere nodosDic y
// retrasosDic ya cargados (los ETA dependen de los retrasos medidos).
function restaurarViajesCalculados() {
    let g = null;
    try { g = JSON.parse(localStorage.getItem("ViajesCalc")); } catch (e) { return; }
    if (!g || !Array.isArray(g.viajes) || g.viajes.length === 0) return;

    // si algún nodo dejó de existir, se descarta ese viaje
    const viajes = g.viajes
        .map(v => v.map(t => nodosDic[t]).filter(Boolean))
        .filter(v => v.length >= 2);
    if (viajes.length === 0) return;

    resultadoViajes = viajes;
    recNodos = viajes[0];
    const dom1 = document.getElementById("outputnodos");
    const res = renderizarViajes(viajes, dom1);
    document.getElementById("totales").innerText =
        `${res.nodos} nodos · dist ${Math.round(res.dist)}`;

    // progreso: anclas y nodos marcados
    const btns = [...document.querySelectorAll("#outputnodos .btn-play")];
    (g.anclas || []).forEach((ancla, i) => {
        if (ancla && btns[i]) btns[i].innerText = "⚓";
    });
    const cboxes = [...document.querySelectorAll("#outputnodos .cboxnodo input[type=checkbox]")];
    (g.checks || []).forEach((marcado, i) => {
        // .click() para que corra colorearNodo y el nodo se pinte en el mapa
        if (marcado && cboxes[i] && !cboxes[i].checked) cboxes[i].click();
    });
    actualizarTiempoRestante();
}

function actualizarTiempoRestante() {
    // suma los tramos pendientes de un conjunto de botones ▶
    const restanteDe = (btns) => {
        let total = 0;
        for (const b of btns) {
            const t = b.innerText.trim();
            if (t === "⚓") continue; // tramo completado
            const m = t.match(/^(\d+):(\d\d)$/); // activo o pausado: cuenta mostrada
            if (m) total += (+m[1]) * 60 + (+m[2]);
            else total += parseFloat(b.dataset.est) || 0; // no iniciado: estimado completo
        }
        return total;
    };
    const completos = (btns) => btns.length > 0 && btns.every(b => b.innerText.trim() === "⚓");

    // restante por viaje, al lado del título
    document.querySelectorAll("#outputnodos > li").forEach(liViaje => {
        const span = liViaje.querySelector(".viajeRestante");
        if (!span) return;
        const btns = [...liViaje.querySelectorAll(".btn-play")];
        if (btns.length === 0) { span.innerText = ""; return; }
        const listo = completos(btns);
        span.classList.toggle("completado", listo);
        span.innerHTML = listo
            ? " | " + icono("check") + " COMPLETADO"
            : " | " + icono("arena") + " " + Navegacion.fmt(restanteDe(btns));
    });

    // restante total (todos los viajes)
    const li = document.getElementById("resumenTiempoRestante");
    if (!li) return;
    const btns = [...document.querySelectorAll("#outputnodos .btn-play")];
    if (btns.length === 0) { li.style.display = "none"; return; }
    li.style.display = "";
    const todosCompletos = completos(btns);
    li.classList.toggle("completado", todosCompletos);
    li.innerHTML = todosCompletos
        ? icono("check") + " COMPLETADO"
        : icono("arena") + " Tiempo restante: " + Modelo.fmtHMS(restanteDe(btns));
}
