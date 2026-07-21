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
    const nombreNodo = this.parentNode.children[1].innerText;
    for (let ndo of nodosM) {
        if (ndo.titulo === nombreNodo) {
            ndo.seleccionado = !ndo.seleccionado;
            return 0;
        }
    }
    return 1;
}

// ============================================
// RENDERIZADOR DE VIAJES
// ============================================
function renderizarViajes(viajes, contenedor) {
    contenedor.innerHTML = "";
    let indiceViaje = 0;
    let totalNodos = 0;
    let distTotal = 0;
    let tiempoTotal = 0;

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
        idBase.innerText = `Viaje ${indiceViaje + 1} · ${rgeneral.length - 2} nodos · dist ${Math.round(distViaje)} · ⏱ ${Navegacion.fmt(tViaje)}`;
        const idRest = document.createElement("span");
        idRest.className = "viajeRestante";
        identificador.append(idBase, idRest);
        
        if (indiceViaje === 0) {
            identificador.classList.add("viajeActivo");
        }

        identificador.id = `viaje${indiceViaje}`;
        identificador.validx = indiceViaje;

        identificador.onclick = function () {
            recNodos = viajes[this.validx];
            const allIds = document.querySelectorAll(".identificadorViaje");
            allIds.forEach(k => k.classList.remove("viajeActivo"));
            this.classList.add("viajeActivo");
            if (identificador.firstNodoSpan) {
                identificador.firstNodoSpan.click();
            }
        };

        liGeneral.append(identificador);

        let firstNodoSpan = undefined;
        const paradas = rgeneral.slice(1, rgeneral.length - 1);
        paradas.forEach((rnodo, j) => {
            const lit = document.createElement("div");
            lit.className = "cboxnodo";

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
            if (tieneRetrasoMedido(origen.titulo, rnodo.titulo)) btnPlay.classList.add("conRetraso");
            btnPlay.onclick = function () {
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

            // tiempo estimado del tramo, visible al lado del nombre
            const spnT = document.createElement("span");
            spnT.className = "tiempoTramo";
            spnT.innerText = "≈ " + Navegacion.fmt(est);

            lit.append(cbox);
            lit.append(spn);
            lit.append(spnT);
            lit.append(btnPlay);
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
            spnV.innerText = "↩ Vuelta a " + destinoV.titulo;
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
            if (tieneRetrasoMedido(origenV.titulo, destinoV.titulo)) btnV.classList.add("conRetraso");
            btnV.onclick = function () {
                Navegacion.zarpar(origenV, destinoV, destinoV.titulo, btnV, null);
            };
            btnV.oncontextmenu = function (ev) {
                ev.preventDefault();
                if (Navegacion.botonActivo() === btnV) Navegacion.cancelar();
                btnV.innerText = "⚓";
                actualizarTiempoRestante();
            };

            const spnTV = document.createElement("span");
            spnTV.className = "tiempoTramo";
            spnTV.innerText = "≈ " + Navegacion.fmt(estV);

            filaV.append(spnV);
            filaV.append(spnTV);
            filaV.append(btnV);
            liGeneral.append(filaV);
        }

        identificador.firstNodoSpan = firstNodoSpan;
        indiceViaje++;
        contenedor.append(liGeneral);
    }

    // Resumen final: tiempo total de todos los viajes (con vueltas) + restante
    if (viajes.length > 0) {
        const resumen = document.createElement("li");
        resumen.id = "resumenTiempoTotal";
        resumen.innerText = `⏱ Tiempo total (${viajes.length} viaje${viajes.length > 1 ? "s" : ""}, con vueltas): ${Modelo.fmtHMS(tiempoTotal)}`;
        contenedor.append(resumen);

        const restanteLi = document.createElement("li");
        restanteLi.id = "resumenTiempoRestante";
        contenedor.append(restanteLi);
    }

    // reposicionar el puntero de atajos de teclado ("." y ",")
    if (typeof Atajos !== "undefined") Atajos.reset();
    actualizarTiempoRestante();

    return { nodos: totalNodos, dist: distTotal };
}

// Tiempo restante = suma de los tramos que aún no tienen ancla (⚓). El tramo
// activo aporta su cuenta regresiva (por eso baja cada segundo mientras viajás);
// los completados aportan 0. Cuando están todos completos: "COMPLETADO".
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
        span.innerText = listo ? " | ✅ COMPLETADO" : " | ⏳ " + Navegacion.fmt(restanteDe(btns));
    });

    // restante total (todos los viajes)
    const li = document.getElementById("resumenTiempoRestante");
    if (!li) return;
    const btns = [...document.querySelectorAll("#outputnodos .btn-play")];
    if (btns.length === 0) { li.style.display = "none"; return; }
    li.style.display = "";
    const todosCompletos = completos(btns);
    li.classList.toggle("completado", todosCompletos);
    li.innerText = todosCompletos ? "✅ COMPLETADO" : "⏳ Tiempo restante: " + Modelo.fmtHMS(restanteDe(btns));
}
