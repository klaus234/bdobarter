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
    // Dos listas separadas de osciladores para poder cortar una sin tocar la
    // otra: si compartieran lista, probar el volumen a mitad de viaje borraría
    // la campanita ya agendada (ver agendarAlerta).
    const notasSonando = [];   // campanita inmediata (prueba de volumen, respaldo)
    const notasAgendadas = []; // campanita del viaje, agendada al zarpar
    let alertaAgendada = false; // ¿el aviso de este viaje ya quedó en el hilo de audio?
    let agendaEnAudio = 0;      // instante del reloj de audio en que arranca esa campanita
    let agendaSerie = 0;        // invalida agendas en vuelo al reprogramar
    let pausado = false;
    let destinoActual = "";
    let hookPausar = null;    // congela el tiempo restante del viaje activo
    let hookReanudar = null;  // retoma el countdown donde quedó
    let hookAjustar = null;   // suma/resta segundos al viaje activo (flechas ←/→)
    let hookReasignar = null; // engancha el viaje en curso a otro botón/fila
    let tickActual = null;    // tick del viaje en curso, para refrescar al volver a la pestaña
    const tituloOriginal = document.title;

    // Valores tal cual están en el panel, sin corregir. Los usa el link a la
    // Calculadora de Retraso, que aplica la corrección por su cuenta.
    function statsCrudos() {
        const chk = document.getElementById("chkDiarioManos");
        return {
            vel: parseFloat(document.getElementById("barcoVel").value) || 100,
            acc: parseFloat(document.getElementById("barcoAcc").value) || 100,
            diario: !chk || chk.checked
        };
    }

    // Velocidad y aceleración ya listas para el modelo: se les suma el bono del
    // Diario de Manos (ver js/modelo.js). La maestría no entra: el % del panel
    // ya viene con ella aplicada, tal como lo muestra el juego.
    function stats() {
        const c = statsCrudos();
        const aj = Modelo.ajusteNavegacion(c.diario);
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
    // Segundos de atraso a partir de los cuales el tick ya no se considera "a
    // horario" (con la pestaña oculta puede correr hasta 60 s tarde).
    const ATRASO_TOLERADO = 10;

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

    // ============================================
    // NOTIFICACIÓN DEL SISTEMA
    // La campanita se puede perder (parlantes bajos, otra cosa sonando); el
    // aviso del sistema queda en pantalla y en el centro de notificaciones,
    // que es lo que sirve cuando estás en el juego y la pestaña quedó tapada.
    // El permiso se pide SOLO desde el checkbox: Chrome descarta los pedidos
    // que no salen de un gesto del usuario, y pedirlo al cargar es invasivo.
    // ============================================
    function estadoNotif() {
        if (!("Notification" in window)) return "sin-soporte";
        return Notification.permission; // "granted" | "denied" | "default"
    }

    function pedirPermisoNotif() {
        const e = estadoNotif();
        if (e !== "default") return Promise.resolve(e);
        try {
            // los navegadores viejos usan callback y devuelven undefined
            const r = Notification.requestPermission();
            return (r && typeof r.then === "function")
                ? r.catch(() => "denied")
                : new Promise(res => setTimeout(() => res(estadoNotif()), 0));
        } catch (err) {
            return Promise.resolve("denied");
        }
    }

    function notificar(titulo, cuerpo) {
        if (estadoNotif() !== "granted") return null;
        try {
            const n = new Notification(titulo, {
                body: cuerpo,
                tag: "bdo-llegada",  // una sola a la vez: la nueva reemplaza a la anterior
                renotify: true
            });
            n.onclick = () => { try { window.focus(); } catch (e) { } n.close(); };
            return n;
        } catch (e) {
            console.warn("Notificación no disponible:", e);
            return null;
        }
    }

    // Aviso de llegada. Solo si la pestaña NO está a la vista: si la estás
    // mirando ya ves el ⚓ y el aviso sería ruido. A diferencia de la voz, acá
    // no importa que el tick haya entrado tarde: el aviso sigue sirviendo.
    function notificarLlegada(destino) {
        const chk = document.getElementById("chkNotif");
        if (!chk || !chk.checked) return;
        if (document.visibilityState === "visible") return;
        notificar("⚓ Llegaste a " + destino, "El barco llegó a destino.");
    }

    // Corta las notas de una lista, estén sonando o solo agendadas. Sin esto,
    // mover el slider de volumen varias veces superpone las campanitas.
    function detenerNotas(lista) {
        const ahora = audioCtx ? audioCtx.currentTime : 0;
        for (const { osc, gan } of lista) {
            try {
                gan.gain.cancelScheduledValues(ahora);
                gan.gain.setValueAtTime(0.0001, ahora);
                osc.stop(ahora); // si aún no empezó, ya no suena
            } catch (e) { /* ya estaba detenida */ }
        }
        lista.length = 0;
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

    // Campanita suave sintetizada (Do-Mi-Sol-Do-Mi), sin archivos. Suena ya.
    function sonarAlerta() {
        const pico = Math.max(0.0002, volumenAlarma());
        if (pico <= 0.0002) return; // volumen en 0: silencio
        // Hay que ESPERAR el resume: con el contexto suspendido currentTime
        // está congelado y las notas se agendarían en un tiempo ya pasado.
        desbloquearAudio()
            .then(ctx => programarCampanita(ctx, pico, 0, notasSonando))
            .catch(e => console.warn("No se pudo reproducir la alarma:", e));
    }

    // ============================================
    // ALARMA AGENDADA (lo que hace que suene con la pestaña de fondo)
    // Con la pestaña oculta el navegador estrangula los setInterval: medido en
    // Chrome, el tick de 250 ms pasa a UNO POR MINUTO a los ~40 s de ocultarla.
    // Si el aviso saliera del tick llegaría hasta un minuto tarde. Por eso la
    // campanita se agenda al zarpar en el reloj del AudioContext, que corre en
    // el hilo de audio y no lo toca ese estrangulamiento: suena a horario
    // aunque el JS de la página esté congelado.
    //
    // El tick queda de respaldo y gana el que llegue primero: hay equipos donde
    // el reloj del AudioContext NO corre a tiempo real (medido: un entorno sin
    // placa de sonido lo hacía avanzar al 65%), y ahí la agendada llegaría
    // tarde. Si el tick entra y la campanita todavía no arrancó, se la calla y
    // suena en el acto; si ya sonó, no se repite.
    // Ojo: la campanita agendada conserva el volumen que había al zarpar.
    // ============================================
    function agendarAlerta(cuandoMs) {
        cancelarAlertaAgendada();
        const pico = Math.max(0.0002, volumenAlarma());
        if (pico <= 0.0002) return; // volumen en 0: silencio
        const marca = agendaSerie;
        desbloquearAudio().then(ctx => {
            if (marca !== agendaSerie) return; // se reprogramó mientras resolvía
            // se recalcula acá: el resume del contexto pudo tardar
            const faltan = (cuandoMs - Date.now()) / 1000;
            if (faltan <= 0) return; // ya llegó: lo resuelve el tick
            agendaEnAudio = programarCampanita(ctx, pico, faltan, notasAgendadas);
            alertaAgendada = true;
        }).catch(() => { /* sin audio: queda el tick de respaldo */ });
    }

    // La agendada ya cumplió: se suelta la bandera SIN cortar las notas, que
    // pueden estar sonando justo en este momento (llegada con la pestaña a la
    // vista: el tick entra 250 ms después de que arrancó la campanita).
    function soltarAlertaAgendada() {
        agendaSerie++; // invalida las agendas que estén esperando el resume
        alertaAgendada = false;
        agendaEnAudio = 0;
    }

    // ¿la campanita agendada ya arrancó? (contra el reloj de audio, no el de pared)
    function agendadaYaSono() {
        return alertaAgendada && audioCtx && audioCtx.currentTime >= agendaEnAudio;
    }

    // Además de soltarla, la calla: el viaje se canceló, se pausó o cambió de hora.
    function cancelarAlertaAgendada() {
        soltarAlertaAgendada();
        detenerNotas(notasAgendadas);
    }

    function programarCampanita(ctx, pico, retardoSeg, lista) {
        detenerNotas(lista); // una alarma a la vez por lista
        const base = ctx.currentTime + Math.max(0, retardoSeg || 0);
        const notas = [523.25, 659.25, 783.99, 1046.50, 1318.51];
        for (let rep = 0; rep < 2; rep++) {
            notas.forEach((f, i) => {
                const t0 = base + rep * 1.7 + i * 0.28;
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
                lista.push(voz);
                osc.onended = () => {
                    const k = lista.indexOf(voz);
                    if (k >= 0) lista.splice(k, 1);
                    try { osc.disconnect(); gan.disconnect(); } catch (e) { }
                };
            });
        }
        return base; // instante (reloj de audio) en que arranca la primera nota
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

    // Mueve el viaje en curso a otro botón/checkbox. Lo usa la lista de viajes
    // después de rehacerse, para no cortar la navegación por haber tocado otro
    // viaje. Devuelve false si no había nada navegando.
    function reasignarFila(nuevoBtn, nuevoCbox) {
        if (!enViaje() || !nuevoBtn || !hookReasignar) return false;
        hookReasignar(nuevoBtn, nuevoCbox || null);
        return true;
    }

    function cancelar() {
        pausado = false;
        cancelarAlertaAgendada();
        tickActual = null;
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

        // el aviso queda agendado en el hilo de audio desde ya: es lo único que
        // suena a horario si la pestaña se va a segundo plano (ver agendarAlerta)
        agendarAlerta(llegada);

        // animación del barco en el mapa (se dibuja solo si el checkbox está activo)
        if (typeof iniciarBarco === "function") iniciarBarco(origen, destino, totalSeg);

        // btn/cbox/fila no son fijos: si la lista de viajes se rehace (agregar,
        // quitar o reordenar paradas), estos elementos dejan de existir y hay
        // que apuntar a los nuevos sin cortar el viaje. Ver reasignarFila().
        filaActiva = { btn };
        let fila = btn.closest(".cboxnodo");
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
                tickActual = null;
                // gana el que llegue primero: si la agendada ya arrancó no se
                // repite, y si todavía no (reloj de audio lento, o nunca se
                // pudo agendar) se la calla y suena en el acto
                if (agendadaYaSono()) {
                    soltarAlertaAgendada();
                } else {
                    cancelarAlertaAgendada();
                    sonarAlerta();
                }
                // Con la pestaña de fondo este tick puede llegar hasta un minuto
                // tarde: pasado ese margen la voz sería un aviso fuera de hora
                // (y de paso, en segundo plano casi ningún navegador la dice).
                if (rest > -ATRASO_TOLERADO) hablarLlegada();
                notificarLlegada(destinoNombre);
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
        // Reengancha este viaje a los elementos nuevos que dejó un re-render
        // de la lista, conservando la cuenta atrás.
        hookReasignar = function (nuevoBtn, nuevoCbox) {
            if (fila) fila.classList.remove("enNavegacion");
            btn = nuevoBtn;
            cbox = nuevoCbox;
            fila = btn.closest(".cboxnodo");
            if (fila) fila.classList.add("enNavegacion");
            filaActiva = { btn };
            btn.dataset.simbolo = btn.dataset.simbolo || "▶";
            btn.innerText = fmt(pausado ? msRestantes / 1000 : (llegada - Date.now()) / 1000);
        };

        // hooks de pausa/reanudación/ajuste para este viaje (cierran sobre llegada/tick)
        // Todos tienen que reprogramar la campanita agendada: está clavada a una
        // hora del reloj de audio y no se entera de pausas ni de las flechas.
        hookPausar = function () {
            msRestantes = llegada - Date.now();
            cancelarAlertaAgendada();
        };
        hookReanudar = function () {
            llegada = Date.now() + msRestantes;
            agendarAlerta(llegada);
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
                agendarAlerta(llegada); // antes del tick: si ya llegó, no agenda y suena el tick
                tick(); // refresca (o dispara la llegada si quedó en 0)
            }
        };

        tickActual = tick;
        tick();
        intervalo = setInterval(tick, 250);
    }

    // Al volver a la pestaña, ponerla al día de una. Con la pestaña oculta el
    // tick corre una vez por minuto, así que el widget, el título y el ⚓ pueden
    // estar hasta un minuto atrasados (o el viaje ya haber terminado).
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible" && tickActual && !pausado) tickActual();
    });

    return { zarpar, cancelar, pausar, reanudar, ajustar, escTimer, enViaje, estaPausado, botonActivo, reasignarFila, sonarAlerta, hablarLlegada, estimarSegundos, stats, statsCrudos, fmt, estadoAudio, desbloquearAudio, alCambiarEstadoAudio, estadoNotif, pedirPermisoNotif, notificar };
})();
window.Navegacion = Navegacion;
