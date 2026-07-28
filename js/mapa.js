// ============================================
// VARIABLES DE ESTADO DEL MAPA
// ============================================
let offsetX = 0;
let offsetY = 0;
let mox = 0;
let moy = 0;
let mouseMove = false;
let mouseClickV;
let ultimoMovimiento = 0;
let hoverNodo = null;
let clickIzquierdo = false; // distingue el arrastre/click izquierdo del derecho

const ZOOM_MIN = 0.08;
const ZOOM_MAX = 3;

// ============================================
// DATOS Y NODOS
// ============================================
let data = [];
const nodosM = [];
let szFixX = 0.866;
let szFixY = 0.866;
let szFixOX = -170;
let szFixOY = -80;
let zoomValue = 1;
let recNodos = [];

// Animación del barco durante un tramo con aviso activo. El barco se
// dibuja en vectores (nítido a cualquier zoom, a diferencia del PNG).
let barcoAnim = null; // {x1,y1,x2,y2,inicio,fin} en coords de datos.json

// ============================================
// FONDO REAL DEL MAPA
// Mosaico del mapa del juego (img/mapa_fondo.webp), generado con
// tools/generar_fondo_mapa.py a partir de los tiles de BDO Codex. Se dibuja
// estirado entre estas dos esquinas, en coordenadas de datos.json: el ajuste
// es un escalado + traslacion, con error mediano de 16 unidades (~3 s de
// viaje). Si se agregan nodos fuera de esta caja hay que regenerarlo.
// ============================================
const FONDO_URL = "img/mapa_fondo.webp";
const FONDO_X0 = -4472.2;
const FONDO_Y0 = -3259.9;
const FONDO_X1 = 4585.3;
const FONDO_Y1 = 3675.9;
const FONDO_VELO = 115; // velo oscuro (~45%): el terreno claro no tapa las etiquetas

let fondoImg = null;
let fondoEstado = "vacio"; // vacio | cargando | listo | error

// Colores
const COLOR_NODO = [52, 152, 219];      // azul: nodo comun
const COLOR_SELECCION = [46, 204, 113]; // verde: marcado en la ruta calculada
const COLOR_RUTA = [231, 76, 60];       // rojo: linea del viaje activo

// nombre limpio de una linea de la ruta planeada (soporta marcadores #o_/#d_)
function nombreDeLinea(linea) {
    for (let parte of linea.split("#")) {
        const p = parte.trim().toUpperCase();
        if (p !== "" && !p.startsWith("O_") && !p.startsWith("D_")) return p;
    }
    return "";
}

// nombre del nodo inicial (campo "Nodo Inicial"), para marcarlo en el mapa
function nodoInicialTitulo() {
    const inp = document.getElementById("inicial");
    return inp ? inp.value.trim().toUpperCase() : "";
}

// nodos en la ruta planeada, para marcarlos en el mapa
function nodosPlaneados() {
    if (window.Ruta && window.Ruta.planeados) return new Set(window.Ruta.planeados());
    const s = new Set();
    const area = document.getElementById("nodosm");
    if (!area) return s;
    for (let linea of area.value.split("\n")) {
        const n = nombreDeLinea(linea);
        if (n !== "") s.add(n);
    }
    return s;
}

// agrega el nodo a la ruta planeada, o lo quita si ya estaba
function toggleNodoPlaneado(titulo) {
    if (window.Ruta && window.Ruta.toggle) { window.Ruta.toggle(titulo); return; }
    const area = document.getElementById("nodosm");
    if (!area) return;
    const lineas = area.value.split("\n").filter(l => l.trim() !== "");
    const sinNodo = lineas.filter(l => nombreDeLinea(l) !== titulo);
    if (sinNodo.length === lineas.length) sinNodo.push(titulo);
    area.value = sinNodo.length ? sinNodo.join("\n") + "\n" : "";
}

// ============================================
// CLASE PARA NODOS DEL MAPA
// ============================================
class NodoM {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.titulo = "";
        this.terminado = false;
        this.seleccionado = false;
    }

    pantallaX() { return (this.x * szFixX + szFixOX) * zoomValue + offsetX; }
    pantallaY() { return (this.y * szFixY + szFixOY) * zoomValue + offsetY; }
    diametro() { return Math.max(9, 30 * zoomValue); }

    bajoMouse() {
        const dx = mouseX - this.pantallaX();
        const dy = mouseY - this.pantallaY();
        const r = this.diametro() / 2 + 4;
        return dx * dx + dy * dy <= r * r;
    }

    dibujar(hover, planeado, esInicial) {
        const xd = this.pantallaX();
        const yd = this.pantallaY();
        const d = this.diametro() * (hover ? 1.25 : 1);

        // anillo verde si es el nodo inicial (por fuera del halo dorado)
        if (esInicial) {
            noFill();
            stroke(46, 204, 113, 235);
            strokeWeight(Math.max(2.5, d * 0.14));
            ellipse(xd, yd, d + 17, d + 17);
        }

        // halo dorado si esta en la ruta planeada
        if (planeado) {
            noFill();
            stroke(212, 175, 55, 220);
            strokeWeight(Math.max(2, d * 0.12));
            ellipse(xd, yd, d + 9, d + 9);
        }

        const base = this.seleccionado ? COLOR_SELECCION : COLOR_NODO;
        if (hover) { stroke(255); strokeWeight(2); }
        else { stroke(10, 20, 40, 160); strokeWeight(1); }
        fill(base[0], base[1], base[2]);
        ellipse(xd, yd, d, d);

        // etiqueta (se ocultan con el mapa alejado para no superponerse)
        if (hover || this.seleccionado || planeado || zoomValue >= 0.35) {
            textAlign(CENTER, TOP);
            textSize(hover ? 13 : 12);
            noStroke();
            fill(0, 0, 0, 150);
            text(this.titulo, xd + 1, yd + d / 2 + 5);
            if (hover) fill(212, 175, 55);
            else if (this.seleccionado) fill(46, 204, 113);
            else fill(235);
            text(this.titulo, xd, yd + d / 2 + 4);
        }
    }
}

// ============================================
// CONTROL DE VISTA (zoom / centrado)
// ============================================

// Zoom anclado: el punto (ax, ay) del canvas queda fijo al escalar.
// Sin ancla, usa el centro del canvas.
function aplicarZoom(nuevoZoom, ax, ay) {
    nuevoZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nuevoZoom));
    if (ax === undefined) ax = width / 2;
    if (ay === undefined) ay = height / 2;
    const factor = nuevoZoom / zoomValue;
    offsetX = ax - (ax - offsetX) * factor;
    offsetY = ay - (ay - offsetY) * factor;
    zoomValue = nuevoZoom;
    ultimoMovimiento = millis();
    const lbl = document.getElementById("zoomPER");
    if (lbl) lbl.innerText = Math.round(zoomValue * 100) + "%";
}

function centrarEnNodo(nodo) {
    offsetX = width / 2 - (nodo.x * szFixX + szFixOX) * zoomValue;
    offsetY = height / 2 - (nodo.y * szFixY + szFixOY) * zoomValue;
    ultimoMovimiento = millis();
}

// Encuadra todos los nodos en el canvas
function ajustarVista() {
    if (nodosM.length === 0) return;
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (const n of nodosM) {
        const wx = n.x * szFixX + szFixOX;
        const wy = n.y * szFixY + szFixOY;
        minx = Math.min(minx, wx); maxx = Math.max(maxx, wx);
        miny = Math.min(miny, wy); maxy = Math.max(maxy, wy);
    }
    const margen = 70;
    const z = Math.min((width - 2 * margen) / (maxx - minx), (height - 2 * margen) / (maxy - miny));
    zoomValue = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    offsetX = width / 2 - ((minx + maxx) / 2) * zoomValue;
    offsetY = height / 2 - ((miny + maxy) / 2) * zoomValue;
    ultimoMovimiento = millis();
    const lbl = document.getElementById("zoomPER");
    if (lbl) lbl.innerText = Math.round(zoomValue * 100) + "%";
}

// ============================================
// EVENTOS DEL RATÓN
// ============================================
// nodo que está bajo el puntero en este momento (sin depender del frame)
function nodoBajoPuntero() {
    for (let i = nodosM.length - 1; i >= 0; i--) {
        if (nodosM[i].bajoMouse()) return nodosM[i];
    }
    return null;
}

function mouseReleased(event) {
    if (mouseY < 0 || mouseY > height || mouseX < 0 || mouseX > width) return;
    // solo el botón izquierdo alterna el nodo (el derecho ya lo agregó al presionar)
    const fueClick = clickIzquierdo && mouseClickV
        && dist(mouseX, mouseY, mouseClickV.x, mouseClickV.y) < 6;
    clickIzquierdo = false;
    mouseMove = false;
    if (fueClick && hoverNodo) toggleNodoPlaneado(hoverNodo.titulo);
    ultimoMovimiento = millis();
}

function mousePressed(event) {
    if (mouseY < 0 || mouseY > height || mouseX < 0 || mouseX > width) return;

    // click derecho sobre un nodo: lo AGREGA a la ruta planeada (nunca lo quita)
    if (event.buttons === 2) {
        const nodo = nodoBajoPuntero();
        if (nodo && window.Ruta && window.Ruta.agregar) window.Ruta.agregar(nodo.titulo);
        ultimoMovimiento = millis();
        return false; // corta el menú contextual del navegador
    }

    if (event.buttons === 1) {
        clickIzquierdo = true;
        mouseMove = true;
        mouseClickV.x = mouseX;
        mouseClickV.y = mouseY;
        mox = offsetX;
        moy = offsetY;
    }
    ultimoMovimiento = millis();
}

function mouseMoved() {
    if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height)
        ultimoMovimiento = millis();
}

function mouseDragged() {
    ultimoMovimiento = millis();
}

// ============================================
// CARGA DE DATOS
// ============================================
function preload() {
    data = loadJSON("data/datos.json");
}

// ¿Está pedido el fondo real? (checkbox; si aún no existe, se asume que sí)
function fondoRealActivo() {
    const chk = document.getElementById("chkFondoReal");
    return !chk || chk.checked;
}

// El fondo pesa ~1.6 MB: se pide recién la primera vez que hace falta y en
// segundo plano. loadImage() fuera de preload() no bloquea, así que el mapa
// se dibuja desde el primer frame y la imagen entra cuando llega.
function pedirFondo() {
    if (fondoEstado !== "vacio") return;
    fondoEstado = "cargando";
    loadImage(FONDO_URL,
        img => {
            fondoImg = img;
            fondoEstado = "listo";
            ultimoMovimiento = millis(); // sale del framerate bajo para pintarlo ya
        },
        () => {
            fondoEstado = "error"; // se sigue usando el océano estilizado
            console.warn("No se pudo cargar " + FONDO_URL + ": queda el fondo estilizado.");
        });
}

// Océano estilizado: el fondo de siempre, cuando el real está apagado,
// todavía viajando o no se pudo cargar.
function dibujarOceanoEstilizado() {
    stroke(20, 40, 80, 100);
    strokeWeight(1);
    for (let y = offsetY % 40; y < height; y += 40) line(0, y, width, y);
    for (let x = offsetX % 40; x < width; x += 40) line(x, 0, x, height);

    // Reflejos de luz en el agua
    fill(50, 100, 150, 50);
    noStroke();
    randomSeed(42);
    for (let i = 0; i < 30; i++) {
        ellipse(random(width), random(height), random(2, 8), random(2, 8));
    }
}

// ¿Hay que dibujar el barco? (checkbox activo + viaje iniciado)
function animBarcoActiva() {
    const chk = document.getElementById("chkAnimBarco");
    return !!(chk && chk.checked && barcoAnim);
}

// Barco estilizado en vectores, diseñado en una caja de 100 unidades
// mirando a la derecha (casco marrón + franja dorada, velas crema,
// banderín rojo). Se dibuja centrado en el origen actual del canvas.
function dibujarBarcoVector(tam) {
    const s = tam / 100;

    // bauprés y mástiles
    stroke(70, 45, 20);
    strokeWeight(Math.max(1, 2.5 * s));
    line(44 * s, 6 * s, 60 * s, -6 * s);
    line(0, 8 * s, 0, -48 * s);
    line(27 * s, 8 * s, 27 * s, -30 * s);

    // velas
    stroke(150, 140, 120);
    strokeWeight(Math.max(1, 1.5 * s));
    fill(242, 238, 222);
    triangle(3 * s, -46 * s, 3 * s, -10 * s, 36 * s, -16 * s);
    triangle(30 * s, -28 * s, 30 * s, -6 * s, 52 * s, -10 * s);

    // banderín
    noStroke();
    fill(231, 76, 60);
    triangle(0, -48 * s, 14 * s, -43 * s, 0, -38 * s);

    // casco
    stroke(40, 25, 12);
    strokeWeight(Math.max(1, 1.5 * s));
    fill(101, 67, 33);
    quad(-44 * s, 6 * s, 46 * s, 6 * s, 32 * s, 30 * s, -34 * s, 30 * s);

    // franja dorada
    stroke(212, 175, 55);
    strokeWeight(Math.max(1, 3 * s));
    line(-42 * s, 11 * s, 44 * s, 11 * s);
    noStroke();
}

// Llamado desde Navegacion.zarpar (index.html): inicia el viaje del barco.
// origen/destino: objetos con x,y en coords de datos.json.
function iniciarBarco(origen, destino, duracionSeg) {
    const ahora = Date.now();
    barcoAnim = {
        x1: origen.x, y1: origen.y,
        x2: destino.x, y2: destino.y,
        inicio: ahora,
        fin: ahora + Math.max(1, duracionSeg) * 1000
    };
}

// Llamado desde Navegacion.cancelar: saca el barco del mapa.
function cancelarBarco() {
    barcoAnim = null;
}

// Llamado desde Navegacion.pausar (ESC): congela el barco donde está.
// Guarda la fracción de progreso y el tiempo restante (para ajustes en pausa).
function pausarBarco() {
    if (!barcoAnim) return;
    const dur = Math.max(1, barcoAnim.fin - barcoAnim.inicio);
    barcoAnim.congelado = Math.min(1, (Date.now() - barcoAnim.inicio) / dur);
    barcoAnim.restanteMs = Math.max(0, barcoAnim.fin - Date.now());
}

// Llamado desde Navegacion.reanudar ("."): retoma la animación donde quedó,
// respetando el tiempo restante (que pudo cambiar con las flechas ←/→).
function reanudarBarco() {
    if (!barcoAnim || barcoAnim.congelado === undefined) return;
    const p = barcoAnim.congelado;
    const restante = barcoAnim.restanteMs || 0;
    const durNueva = (p < 1) ? (restante / (1 - p)) : Math.max(1, barcoAnim.fin - barcoAnim.inicio);
    barcoAnim.inicio = Date.now() - p * durNueva;
    barcoAnim.fin = barcoAnim.inicio + durNueva;
    delete barcoAnim.congelado;
    delete barcoAnim.restanteMs;
}

// Llamado desde Navegacion.ajustar (flechas): suma/resta al viaje del barco,
// manteniéndolo sincronizado con el timer (mismo delta, mismo origen de tiempo).
function ajustarBarco(deltaSeg) {
    if (!barcoAnim) return;
    const dms = deltaSeg * 1000;
    if (barcoAnim.congelado !== undefined) {
        barcoAnim.restanteMs = Math.max(0, (barcoAnim.restanteMs || 0) + dms);
    } else {
        barcoAnim.fin = Math.max(Date.now(), barcoAnim.fin + dms);
    }
}

// ============================================
// INICIALIZACIÓN
// ============================================
function setup() {
    let canvas = createCanvas(800, 600);
    mouseClickV = createVector(0, 0);
    frameRate(30);
    textSize(14);
    textStyle(BOLD);
    canvas.parent("mapa");

    // Sin menú contextual sobre el mapa: el click derecho lo usamos para
    // agregar nodos a la ruta planeada (ver mousePressed).
    const contenedorMapa = document.getElementById("mapa");
    if (contenedorMapa) contenedorMapa.addEventListener("contextmenu", e => e.preventDefault());

    // Cargar nodos desde datos
    for (let i = 0, dnodo = data[i]; dnodo !== undefined; i++, dnodo = data[i]) {
        let nnodo = new NodoM(dnodo["x"], dnodo["y"]);
        nnodo.titulo = dnodo["titulo"];
        nnodo.terminado = true;
        nodosM.push(nnodo);
    }

    // Vista inicial centrada en el nodo de partida por defecto
    const inicial = nodosM.find(n => n.titulo === "ILIYA") || nodosM[0];
    if (inicial) centrarEnNodo(inicial);
}

// ============================================
// DIBUJO - LOOP PRINCIPAL
// ============================================
function draw() {
    // framerate adaptativo: fluido al interactuar o con el barco navegando
    const barcoNavegando = animBarcoActiva() && barcoAnim.congelado === undefined && Date.now() < barcoAnim.fin;
    if (mouseMove || millis() - ultimoMovimiento < 1800 || barcoNavegando) frameRate(30);
    else frameRate(8);

    // Actualizar offset si se está arrastrando (antes del fondo: si no, la
    // imagen quedaría un frame atrás de los nodos al arrastrar)
    if (mouseMove) {
        offsetX = mox + (mouseX - mouseClickV.x);
        offsetY = moy + (mouseY - mouseClickV.y);
    }

    // Fondo: el mapa real del juego, o el océano estilizado mientras no esté
    background(10, 20, 40);
    const conFondoReal = fondoRealActivo();
    if (conFondoReal) pedirFondo();
    if (conFondoReal && fondoEstado === "listo") {
        image(fondoImg,
            (FONDO_X0 * szFixX + szFixOX) * zoomValue + offsetX,
            (FONDO_Y0 * szFixY + szFixOY) * zoomValue + offsetY,
            (FONDO_X1 - FONDO_X0) * szFixX * zoomValue,
            (FONDO_Y1 - FONDO_Y0) * szFixY * zoomValue);
        noStroke();
        fill(10, 20, 40, FONDO_VELO);
        rect(0, 0, width, height);
    } else {
        dibujarOceanoEstilizado();
    }

    const px = (p) => (p.x * szFixX + szFixOX) * zoomValue + offsetX;
    const py = (p) => (p.y * szFixY + szFixOY) * zoomValue + offsetY;

    // 1) Líneas del viaje activo (debajo de los nodos)
    if (recNodos.length > 1) {
        stroke(COLOR_RUTA[0], COLOR_RUTA[1], COLOR_RUTA[2], 190);
        strokeWeight(Math.max(3, 6 * zoomValue));
        for (let i = 1; i < recNodos.length; i++) {
            line(px(recNodos[i - 1]), py(recNodos[i - 1]), px(recNodos[i]), py(recNodos[i]));
        }
    }

    // 2) Nodos (hover + marca de planeados)
    const dentro = mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height;
    hoverNodo = null;
    if (dentro && !mouseMove) {
        for (let i = nodosM.length - 1; i >= 0; i--) {
            if (nodosM[i].bajoMouse()) { hoverNodo = nodosM[i]; break; }
        }
    }
    const planeados = nodosPlaneados();
    const inicial = nodoInicialTitulo();
    for (let nodo of nodosM) {
        if (nodo !== hoverNodo) nodo.dibujar(false, planeados.has(nodo.titulo), nodo.titulo === inicial);
    }
    if (hoverNodo) hoverNodo.dibujar(true, planeados.has(hoverNodo.titulo), hoverNodo.titulo === inicial);

    // 3) Números de orden del viaje activo
    if (recNodos.length > 2) {
        textAlign(CENTER, CENTER);
        textStyle(BOLD);
        textSize(17);
        const sep = Math.max(9, 30 * zoomValue) * 0.9 + 8;
        for (let j = 1; j < recNodos.length - 1; j++) {
            noStroke();
            fill(10, 20, 40, 235);
            ellipse(px(recNodos[j]), py(recNodos[j]) - sep, 26, 26);
            fill(231, 76, 60);
            text(j, px(recNodos[j]), py(recNodos[j]) - sep + 1);
        }
    }

    // 4) Barco navegando o estacionado en el destino
    if (animBarcoActiva()) {
        const dur = Math.max(1, barcoAnim.fin - barcoAnim.inicio);
        const prog = (barcoAnim.congelado !== undefined)
            ? barcoAnim.congelado
            : Math.min(1, (Date.now() - barcoAnim.inicio) / dur);
        const bx = barcoAnim.x1 + (barcoAnim.x2 - barcoAnim.x1) * prog;
        const by = barcoAnim.y1 + (barcoAnim.y2 - barcoAnim.y1) * prog;
        const sx = (bx * szFixX + szFixOX) * zoomValue + offsetX;
        const sy = (by * szFixY + szFixOY) * zoomValue + offsetY;
        const tam = Math.max(20, 48 * zoomValue);
        push();
        translate(sx, sy - tam * 0.24); // apenas por encima del nodo
        if (barcoAnim.x2 < barcoAnim.x1) scale(-1, 1); // el diseño mira a la derecha
        dibujarBarcoVector(tam);
        pop();
    }

    cursor(hoverNodo ? HAND : (mouseMove ? "grabbing" : ARROW));

    // Cancelar arrastre si el mouse salió del canvas
    if (!dentro) mouseMove = false;

    noStroke();
}
