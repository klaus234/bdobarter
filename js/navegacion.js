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
    let notasSonando = []; // osciladores agendados, para poder cortarlos
    let pausado = false;
    let destinoActual = "";
    let hookPausar = null;   // congela el tiempo restante del viaje activo
    let hookReanudar = null; // retoma el countdown donde quedó
    let hookAjustar = null;  // suma/resta segundos al viaje activo (flechas ←/→)
    const tituloOriginal = document.title;

    // Valores tal cual están en el panel, sin corregir. Los usa el link a la
    // Calculadora de Retraso, que aplica la corrección por su cuenta.
    function statsCrudos() {
        const chk = document.getElementById("chkDiarioManos");
        const inpM = document.getElementById("barcoMaestria");
        // campo vacío o sin el control = se asume el 11% de la calibración,
        // que deja el ajuste en 0 (y no en -11, como haría un || 0)
        const m = inpM ? parseFloat(inpM.value) : NaN;
        return {
            vel: parseFloat(document.getElementById("barcoVel").value) || 100,
            acc: parseFloat(document.getElementById("barcoAcc").value) || 100,
            maestria: isNaN(m) ? Modelo.MAESTRIA_BASE : m,
            diario: !chk || chk.checked
        };
    }

    // Velocidad y aceleración ya listas para el modelo: se les suma el ajuste
    // por maestría y Diario de Manos (ver js/modelo.js).
    function stats() {
        const c = statsCrudos();
        const aj = Modelo.ajusteNavegacion(c.maestria, c.diario);
        return { vel: c.vel + aj, acc: c.acc + aj };
    }

    // Volumen de alarma: el slider (0-300%) escala el pico base. 100% = el
    // sonido original ("está bien" por default); más alto = más fuerte.
    const GANANCIA_BASE = 0.09;
    function porcentajeVolumen() {
        const sl = document.getElementById("volAlarma");
        const pct = sl ? parseFloat(sl.value) : 100;
        return isNaN(pct) ? 100 : pct;
    }
    function volumenAlarma() {
        return GANANCIA_BASE * porcentajeVolumen() / 100;
    }

    // ---- Voz de llegada (Web Speech API: nativa del navegador, sin internet) ----
    function vozEspanol() {
        const voces = window.speechSynthesis.getVoices() || [];
        const es = voces.filter(v => /^es/i.test(v.lang));
        if (es.length === 0) return null; // sin voz española instalada
        // se prefiere español latino si el sistema lo tiene
        return es.find(v => /^es[-_](AR|419|MX|US|CL|CO)/i.test(v.lang)) || es[0];
    }

    // Dice "Se llegó a destino" si el checkbox está activo. Sale un toque
    // después de la campanita para que no se pisen.
    function hablarLlegada() {
        const chk = document.getElementById("chkVoz");
        if (!chk || !chk.checked || !window.speechSynthesis) return;
        const vol = Math.min(1, porcentajeVolumen() / 100);
        if (vol <= 0) return;
        setTimeout(() => {
            try {
                const u = new SpeechSynthesisUtterance("Se llegó a destino");
                const v = vozEspanol();
                if (v) u.voice = v;
                u.lang = v ? v.lang : "es-ES";
                u.volume = vol;
                window.speechSynthesis.cancel(); // no encolar avisos viejos
                window.speechSynthesis.speak(u);
            } catch (e) {
                console.warn("Voz no disponible:", e);
            }
        }, 450);
    }

    // Corta la campanita que esté sonando (o agendada). Sin esto, mover
    // el slider de volumen varias veces superpone las notas.
    function detenerAlerta() {
        const ahora = audioCtx ? audioCtx.currentTime : 0;
        for (const { osc, gan } of notasSonando) {
            try {
                gan.gain.cancelScheduledValues(ahora);
                gan.gain.setValueAtTime(0.0001, ahora);
                osc.stop(ahora); // si aún no empezó, ya no suena
            } catch (e) { /* ya estaba detenida */ }
        }
        notasSonando = [];
    }

    // ============================================
    // DESBLOQUEO DEL AUDIO
    // Los navegadores crean el AudioContext SUSPENDIDO hasta que hay un gesto
    // del usuario. Si se creaba recién al llegar a destino —minutos después
    // del último click— quedaba mudo, y por eso "se arreglaba" moviendo el
    // slider de volumen: ese movimiento es el gesto que lo destraba. Acá se
    // destraba con la primera interacción con la página, sea cual sea.
    // ============================================
    let avisarEstado = null; // callback para que la UI muestre cómo está

    function crearCtx() {
        if (audioCtx) return audioCtx;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtx = new AC();
        audioCtx.onstatechange = () => { if (avisarEstado) avisarEstado(estadoAudio()); };
        return audioCtx;
    }

    // "listo" | "bloqueado" | "sin-soporte"
    function estadoAudio() {
        if (!(window.AudioContext || window.webkitAudioContext)) return "sin-soporte";
        if (!audioCtx) return "bloqueado";
        return audioCtx.state === "running" ? "listo" : "bloqueado";
    }

    function alCambiarEstadoAudio(fn) { avisarEstado = fn; }

    // Resuelve recién cuando el contexto quedó realmente corriendo.
    function desbloquearAudio() {
        const ctx = crearCtx();
        if (!ctx) return Promise.reject(new Error("sin AudioContext"));
        if (ctx.state === "running") return Promise.resolve(ctx);
        return ctx.resume().then(() => {
            if (avisarEstado) avisarEstado(estadoAudio());
            return ctx;
        });
    }

    // Se reintenta en cada gesto hasta que el navegador lo permita.
    function desbloquearConGesto() {
        desbloquearAudio().then(() => {
            window.removeEventListener("pointerdown", desbloquearConGesto);
            window.removeEventListener("keydown", desbloquearConGesto);
        }).catch(() => { });
    }
    window.addEventListener("pointerdown", desbloquearConGesto);
    window.addEventListener("keydown", desbloquearConGesto);

    // Campanita suave sintetizada (Do-Mi-Sol-Do-Mi), sin archivos.
    function sonarAlerta() {
        const pico = Math.max(0.0002, volumenAlarma());
        if (pico <= 0.0002) return; // volumen en 0: silencio
        // Hay que ESPERAR el resume: con el contexto suspendido currentTime
        // está congelado y las notas se agendarían en un tiempo ya pasado.
        desbloquearAudio()
            .then(ctx => programarCampanita(ctx, pico))
            .catch(e => console.warn("No se pudo reproducir la alarma:", e));
    }

    function programarCampanita(ctx, pico) {
        detenerAlerta(); // una alarma a la vez
        const notas = [523.25, 659.25, 783.99, 1046.50, 1318.51];
        for (let rep = 0; rep < 2; rep++) {
            notas.forEach((f, i) => {
                const t0 = ctx.currentTime + rep * 1.7 + i * 0.28;
                const osc = ctx.createOscillator();
                const gan = ctx.createGain();
                osc.type = "sine";
                osc.frequency.value = f;
                gan.gain.setValueAtTime(0.0001, t0);
                gan.gain.exponentialRampToValueAtTime(pico, t0 + 0.03);
                gan.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
                osc.connect(gan).connect(ctx.destination);
                osc.start(t0);
                osc.stop(t0 + 1);
                // registrar para poder cortarla, y soltarla al terminar
                const voz = { osc, gan };
                notasSonando.push(voz);
                osc.onended = () => {
                    notasSonando = notasSonando.filter(v => v !== voz);
                    try { osc.disconnect(); gan.disconnect(); } catch (e) { }
                };
            });
        }
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
        if (typeof actualizarTiempoRestante === "function") actualizarTiempoRestante();
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
        if (typeof actualizarTiempoRestante === "function") actualizarTiempoRestante();
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
                hablarLlegada();
                if (cbox && !cbox.checked) cbox.click(); // marcar visitado en el mapa
                btn.innerText = "⚓";
                if (fila) fila.classList.remove("enNavegacion");
                filaActiva = null;
                if (typeof actualizarTiempoRestante === "function") actualizarTiempoRestante();
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
            if (typeof actualizarTiempoRestante === "function") actualizarTiempoRestante();
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

    return { zarpar, cancelar, pausar, reanudar, ajustar, escTimer, enViaje, estaPausado, botonActivo, sonarAlerta, hablarLlegada, estimarSegundos, stats, statsCrudos, fmt, estadoAudio, desbloquearAudio, alCambiarEstadoAudio };
})();
window.Navegacion = Navegacion;
