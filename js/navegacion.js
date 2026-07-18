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
    // como si nunca se hubiese apretado play. La pausa no se reanuda.
    function pausar() {
        if (!intervalo || pausado) return;
        clearInterval(intervalo);
        intervalo = null;
        pausado = true;
        document.getElementById("timerDestino").innerText = "⏸ " + destinoActual;
        document.title = "⏸ " + destinoActual + " — " + tituloOriginal;
        if (typeof pausarBarco === "function") pausarBarco();
    }

    function escTimer() {
        if (intervalo && !pausado) { pausar(); return; }
        if (pausado) cancelar();
    }

    function enViaje() {
        return intervalo !== null || pausado;
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
        const llegada = Date.now() + totalSeg * 1000;

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
        tick();
        intervalo = setInterval(tick, 250);
    }

    return { zarpar, cancelar, pausar, escTimer, enViaje, estimarSegundos, stats, fmt };
})();
window.Navegacion = Navegacion;
