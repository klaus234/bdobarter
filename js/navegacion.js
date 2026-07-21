// Módulo Navegacion: avisos de llegada, pausa y sonido
// (extraído de index.html sin cambios de lógica)

// ============================================
// MÓDULO NAVEGACIÓN: aviso de llegada del barco
// El modelo físico (constantes, ETA, formato) vive en js/modelo.js.
// ============================================
const Navegacion = (function () {
    const estimarSegundos = Modelo.estimarSegundos;
    const fmt = Modelo.fmt;
    let intervalo = null;
    let filaActiva = null;
    let audioCtx = null;
    let pausado = false;
    let destinoActual = "";
    let hookPausar = null;   // congela el tiempo restante del viaje activo
    let hookReanudar = null; // retoma el countdown donde quedó
    let hookAjustar = null;  // suma/resta segundos al viaje activo (flechas ←/→)
    const tituloOriginal = document.title;

    function stats() {
        const vel = parseFloat(document.getElementById("barcoVel").value) || 100;
        const acc = parseFloat(document.getElementById("barcoAcc").value) || 100;
        return { vel, acc };
    }

    // Campanita suave sintetizada (C5-E5-G5, volumen bajo), sin archivos.
    function sonarAlerta() {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === "suspended") audioCtx.resume();
            const notas = [523.25, 659.25, 783.99];
            for (let rep = 0; rep < 2; rep++) {
                notas.forEach((f, i) => {
                    const t0 = audioCtx.currentTime + rep * 1.15 + i * 0.28;
                    const osc = audioCtx.createOscillator();
                    const gan = audioCtx.createGain();
                    osc.type = "sine";
                    osc.frequency.value = f;
                    gan.gain.setValueAtTime(0.0001, t0);
                    gan.gain.exponentialRampToValueAtTime(0.09, t0 + 0.03);
                    gan.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
                    osc.connect(gan).connect(audioCtx.destination);
                    osc.start(t0);
                    osc.stop(t0 + 1);
                });
            }
        } catch (e) { console.warn("Audio no disponible:", e); }
    }

    // ESC: primer toque detiene el reloj; el segundo cancela el viaje
    // como si nunca se hubiese apretado play. Con "." se reanuda la pausa.
    function pausar() {
        if (!intervalo || pausado) return;
        clearInterval(intervalo);
        intervalo = null;
        pausado = true;
        if (hookPausar) hookPausar();
        document.getElementById("timerDestino").innerText = "⏸ " + destinoActual;
        document.title = "⏸ " + destinoActual + " — " + tituloOriginal;
        if (typeof pausarBarco === "function") pausarBarco();
    }

    function reanudar() {
        if (!pausado || !hookReanudar) return;
        pausado = false;
        document.getElementById("timerDestino").innerText = "→ " + destinoActual;
        if (typeof reanudarBarco === "function") reanudarBarco();
        hookReanudar();
    }

    function escTimer() {
        if (intervalo && !pausado) { pausar(); return; }
        if (pausado) cancelar();
    }

    function enViaje() {
        return intervalo !== null || pausado;
    }

    function estaPausado() {
        return pausado;
    }

    // Flechas ←/→: resta/suma segundos al viaje activo (corriendo o en pausa).
    // El barco del mapa se ajusta en paralelo para no desincronizarse.
    function ajustar(deltaSeg) {
        if (!enViaje() || !hookAjustar) return;
        hookAjustar(deltaSeg);
        if (typeof ajustarBarco === "function") ajustarBarco(deltaSeg);
    }

    // botón ▶ del viaje activo (o null): lo usa el click derecho para saber
    // si tiene que cancelar el aviso antes de marcar el tramo como terminado
    function botonActivo() {
        return filaActiva ? filaActiva.btn : null;
    }

    function cancelar() {
        pausado = false;
        if (typeof cancelarBarco === "function") cancelarBarco();
        if (intervalo) { clearInterval(intervalo); intervalo = null; }
        if (filaActiva) {
            filaActiva.btn.innerText = filaActiva.btn.dataset.simbolo || "▶";
            const fila = filaActiva.btn.closest(".cboxnodo");
            if (fila) fila.classList.remove("enNavegacion");
            filaActiva = null;
        }
        document.getElementById("timerViaje").style.display = "none";
        document.title = tituloOriginal;
    }

    // origen/destino: objetos con x,y (Nodo o plano del cache)
    function zarpar(origen, destino, destinoNombre, btn, cbox) {
        cancelar(); // un barco a la vez: reemplaza el aviso anterior
        destinoActual = destinoNombre;
        const { vel, acc } = stats();
        const distancia = dist2(origen.x, origen.y, destino.x, destino.y);
        const retraso = retrasoEntre(origen.titulo, destino.titulo);
        const totalSeg = estimarSegundos(distancia, vel, acc, retraso);
        let llegada = Date.now() + totalSeg * 1000;
        let msRestantes = 0;

        // animación del barco en el mapa (se dibuja solo si el checkbox está activo)
        if (typeof iniciarBarco === "function") iniciarBarco(origen, destino, totalSeg);

        filaActiva = { btn };
        const fila = btn.closest(".cboxnodo");
        if (fila) fila.classList.add("enNavegacion");

        const widget = document.getElementById("timerViaje");
        const wDest = document.getElementById("timerDestino");
        const wCuenta = document.getElementById("timerCuenta");
        widget.style.display = "flex";
        wDest.innerText = "→ " + destinoNombre;

        function tick() {
            const rest = (llegada - Date.now()) / 1000;
            if (rest <= 0) {
                clearInterval(intervalo);
                intervalo = null;
                wCuenta.innerText = "0:00";
                wDest.innerText = "⚓ " + destinoNombre;
                document.title = "⚓ " + destinoNombre + " — " + tituloOriginal;
                sonarAlerta();
                if (cbox && !cbox.checked) cbox.click(); // marcar visitado en el mapa
                btn.innerText = "⚓";
                if (fila) fila.classList.remove("enNavegacion");
                filaActiva = null;
                setTimeout(() => {
                    if (!intervalo) {
                        widget.style.display = "none";
                        document.title = tituloOriginal;
                    }
                }, 8000);
                return;
            }
            wCuenta.innerText = fmt(rest);
            btn.innerText = fmt(rest);
            document.title = "⏱ " + fmt(rest) + " → " + destinoNombre;
        }
        // hooks de pausa/reanudación/ajuste para este viaje (cierran sobre llegada/tick)
        hookPausar = function () {
            msRestantes = llegada - Date.now();
        };
        hookReanudar = function () {
            llegada = Date.now() + msRestantes;
            tick();
            intervalo = setInterval(tick, 250);
        };
        hookAjustar = function (deltaSeg) {
            const dms = deltaSeg * 1000;
            if (pausado) {
                msRestantes = Math.max(0, msRestantes + dms);
                const s = msRestantes / 1000;
                wCuenta.innerText = fmt(s);
                btn.innerText = fmt(s);
            } else {
                llegada = Math.max(Date.now(), llegada + dms);
                tick(); // refresca (o dispara la llegada si quedó en 0)
            }
        };

        tick();
        intervalo = setInterval(tick, 250);
    }

    return { zarpar, cancelar, pausar, reanudar, ajustar, escTimer, enViaje, estaPausado, botonActivo, estimarSegundos, stats, fmt };
})();
window.Navegacion = Navegacion;
