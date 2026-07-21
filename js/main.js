// Wiring principal: cálculo de rutas y window.onload
// (extraído de index.html sin cambios de lógica)

// ============================================
// MANEJADOR PRINCIPAL DE CÁLCULO
// ============================================
function calcularNodos() {
    resetearNodosColor();
    const modoManual = document.getElementById("chkManual").checked;
    dependenciasEncadenadas = !modoManual && (
        document.getElementById("chkDependencias").checked
        || document.getElementById("nodosm").value.includes("#d_"));

    const nodosInp = document.getElementById("nodosm").value;
    const nodosRecorridos = nodosInp.split("\n");
    const recorrido = [];
    const recorrido_titulo = [];

    let inicial = document.getElementById("inicial").value.toUpperCase();

    for (let linea of nodosRecorridos) {
        // nombreDeLinea (mapa_zoom.js) ignora los marcadores #o_/#d_
        const nodo = nombreDeLinea(linea);
        if (nodo === "") continue;
        if (nodo in nodosDic) {
            recorrido.push(nodosDic[nodo]);
            recorrido_titulo.push(nodo);
        } else {
            console.warn(`Nodo no encontrado: ${nodo}`);
        }
    }

    if (recorrido.length === 0 && !dependenciasEncadenadas) {
        alert("⚠️ Por favor, ingresa al menos un nodo válido.");
        return;
    }

    recorrido_titulo.sort();
    const clavetitulo = recorrido_titulo.join(", ");
    const dom1 = document.getElementById("outputnodos");
    const maxNodosPViaje = parseInt(document.getElementById("viajes").value);

    // Intentar cargar del cache (solo rutas optimizadas sin dependencias)
    if (recorrido_titulo.length > 9 && !ignoreCache && !modoManual && !dependenciasEncadenadas) {
        fetch('data/cache_nodes_v1.json')
            .then(response => response.json())
            .then(data => {
                if (clavetitulo in data[recorrido_titulo.length]) {
                    const resultadoViajes = data[recorrido_titulo.length][clavetitulo];
                    recNodos = resultadoViajes[0];
                    dom1.innerHTML = "";
                    const res = renderizarViajes(resultadoViajes, dom1);
                    document.getElementById("totales").innerText = `${res.nodos} nodos · dist ${Math.round(res.dist)} [cache]`;
                } else {
                    ignoreCache = true;
                    calcularNodos();
                }
            })
            .catch(() => {
                ignoreCache = true;
                calcularNodos();
            });
        return;
    }

    ignoreCache = false;
    dom1.innerHTML = "<em style='color: var(--accent-blue);'>Calculando rutas...</em>";

    let actual = nodosDic[inicial];
    if (!actual) {
        alert("⚠️ Nodo inicial no encontrado: " + inicial);
        return;
    }

    if (modoManual) {
        // Modo manual: sin optimización, en el orden ingresado. Se corta un
        // viaje al llegar al máximo de nodos O al encontrar un separador (SEP).
        resultadoViajes = [];
        let viajeActual = [];
        const cerrar = () => {
            if (viajeActual.length) {
                resultadoViajes.push([actual, ...viajeActual, actual]);
                viajeActual = [];
            }
        };
        for (let linea of nodosRecorridos) {
            const nombre = nombreDeLinea(linea);
            if (nombre === "") continue;
            if (nombre === "SEP") { cerrar(); continue; }
            if (!(nombre in nodosDic)) continue;
            viajeActual.push(nodosDic[nombre]);
            if (viajeActual.length === maxNodosPViaje) cerrar();
        }
        cerrar();
        recNodos = resultadoViajes[0];
    } else if (dependenciasEncadenadas) {
        resultadoViajes = calcularRutaConCadenasDP(nodosRecorridos, actual, maxNodosPViaje, nodosDic);
        recNodos = resultadoViajes[0];
    } else {
        resultadoViajes = calcularRutaPerfectaDP(recorrido, actual, maxNodosPViaje);
        recNodos = resultadoViajes[0];
    }
    
    const res = renderizarViajes(resultadoViajes, dom1);
    document.getElementById("totales").innerText = `${res.nodos} nodos · dist ${Math.round(res.dist)}`;
}

// ============================================
// INICIALIZACIÓN
// ============================================
window.onload = function () {
    // Cargar datos de nodos
    fetch('data/datos.json')
        .then(response => response.json())
        .then(data => {
            ndata = data;
            for (let nodo of ndata) {
                nodosDic[nodo.titulo] = new Nodo(nodo.x, nodo.y, nodo.titulo);
            }
            
            $("#inicial").autocomplete({
                source: Object.keys(nodosDic)
            });
            
            $("#agregar").autocomplete({
                source: Object.keys(nodosDic)
            });
        });

    // Cargar retrasos medidos entre nodos (si el archivo no existe, sin retrasos)
    fetch('data/retrasos.json')
        .then(response => response.json())
        .then(lista => {
            for (const r of lista) {
                const clave = [String(r.nodoA).toUpperCase(), String(r.nodoB).toUpperCase()].sort().join("|");
                retrasosDic[clave] = r.retraso;
            }
        })
        .catch(() => console.warn("retrasos.json no disponible"));

    // Lista visual de la ruta (carga lo guardado desde localStorage)
    const nmm = document.getElementById("nodosm");
    Ruta.init();

    // Agregar nodo desde el buscador
    document.getElementById("agregar").addEventListener("keyup", function (event) {
        if (event.key === "Enter") {
            Ruta.agregar(this.value);
            this.value = "";
        }
    });

    // Botones principales
    document.getElementById("btnmateriales").onclick = calcularNodos;

    // Separador de viaje (solo afecta en Modo Manual)
    document.getElementById("btnSeparador").onclick = function () {
        Ruta.agregar("SEP");
    };

    document.getElementById("guardar").onclick = function () {
        Ruta.sincronizar();
        localStorage.setItem("NodosR", nmm.value);
        localStorage.setItem("BarcoVel", document.getElementById("barcoVel").value);
        localStorage.setItem("BarcoAcc", document.getElementById("barcoAcc").value);
        localStorage.setItem("ModoManual", document.getElementById("chkManual").checked ? "1" : "0");
        localStorage.setItem("AnimBarco", document.getElementById("chkAnimBarco").checked ? "1" : "0");
        showMessageGuardando();
    };

    // Modo manual y animación: restaurar; renderizar savestates
    document.getElementById("chkManual").checked = localStorage.getItem("ModoManual") === "1";
    if (localStorage.getItem("AnimBarco") !== null)
        document.getElementById("chkAnimBarco").checked = localStorage.getItem("AnimBarco") === "1";
    SaveStates.render();

    // Datos del barco: restaurar y mostrar estimación de referencia
    const barcoVel = document.getElementById("barcoVel");
    const barcoAcc = document.getElementById("barcoAcc");
    if (localStorage.getItem("BarcoVel")) barcoVel.value = localStorage.getItem("BarcoVel");
    if (localStorage.getItem("BarcoAcc")) barcoAcc.value = localStorage.getItem("BarcoAcc");

    function actualizarInfoBarco() {
        const { vel, acc } = Navegacion.stats();
        const t = Navegacion.estimarSegundos(750, vel, acc);
        document.getElementById("barcoInfo").innerText =
            `Con este barco: 750 unidades en línea recta ≈ ${Navegacion.fmt(t)}`;
    }
    barcoVel.addEventListener("input", actualizarInfoBarco);
    barcoAcc.addEventListener("input", actualizarInfoBarco);
    actualizarInfoBarco();

    document.getElementById("timerCancelar").onclick = function () {
        Navegacion.cancelar();
    };

    // Atajos de teclado (se ignoran al escribir en inputs/textarea)
    // Atajos: . y , (clásicos) + Q/E/R alrededor de WASD; ESC y R pausan/cancelan
    document.addEventListener("keydown", function (e) {
        if (e.target && e.target.matches && e.target.matches("input, textarea, select")) return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        const k = e.key.toLowerCase();
        if (k === "." || k === "e") {
            e.preventDefault();
            Atajos.zarparActual();
        } else if (k === "," || k === "q") {
            e.preventDefault();
            if (e.shiftKey) Atajos.anterior();
            else Atajos.siguiente();
        } else if (k === "escape" || k === "r") {
            if (k === "r") e.preventDefault();
            Navegacion.escTimer();
        } else if (e.key === "ArrowLeft") {
            if (Navegacion.enViaje()) { e.preventDefault(); Navegacion.ajustar(-10); }
        } else if (e.key === "ArrowRight") {
            if (Navegacion.enViaje()) { e.preventDefault(); Navegacion.ajustar(10); }
        }
    });

    // Zoom controls (aplicarZoom ancla el zoom para que no se desplace)
    document.getElementById("btnZoomIn").onclick = function (e) {
        e.preventDefault();
        aplicarZoom(zoomValue * 1.2); // ancla: centro del canvas
    };
    document.getElementById("btnZoomOut").onclick = function (e) {
        e.preventDefault();
        aplicarZoom(zoomValue / 1.2);
    };
    document.getElementById("btnCentrar").onclick = function (e) {
        e.preventDefault();
        const nodo = nodosDic[document.getElementById("inicial").value.toUpperCase().trim()];
        if (nodo) centrarEnNodo(nodo);
    };
    document.getElementById("btnVerTodo").onclick = function (e) {
        e.preventDefault();
        ajustarVista();
    };

    // Mouse wheel zoom, anclado a la posición del puntero
    document.getElementById("mapa").addEventListener("wheel", function (e) {
        e.preventDefault();
        let ax, ay;
        const canvas = document.getElementById("defaultCanvas0");
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            ax = (e.clientX - rect.left) * (width / rect.width);
            ay = (e.clientY - rect.top) * (height / rect.height);
        }
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        aplicarZoom(zoomValue * factor, ax, ay);
    });

    // Slider erase button
    const slideErase = document.getElementById("slider_erase");
    const slideContainer = slideErase.parentElement;
    let currentXErase = 0;
    let isDragging = false;

    slideErase.onmousedown = function (e) {
        isDragging = true;
        currentXErase = e.clientX - slideErase.offsetLeft;
        slideErase.style.transition = "none";
    };

    const movGUIFnc = function (e) {
        if (!isDragging) return;
        e.preventDefault();
        const maxX = slideContainer.offsetWidth - slideErase.offsetWidth - 8;
        let posx = e.clientX - currentXErase;

        if (posx < 4) posx = 4;
        if (posx >= maxX) {
            Ruta.limpiar();
        }
        slideErase.style.left = posx + "px";
    };

    const movFncE = function (e) {
        if (!isDragging) return;
        isDragging = false;
        slideErase.style.transition = "left 0.3s ease";
        slideErase.style.left = "4px";
    };

    document.addEventListener('mousemove', movGUIFnc);
    document.addEventListener('mouseup', movFncE);
};
