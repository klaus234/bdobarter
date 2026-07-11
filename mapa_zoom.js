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

// Colores
const COLOR_NODO = [52, 152, 219];      // azul: nodo comun
const COLOR_SELECCION = [46, 204, 113]; // verde: marcado en la ruta calculada
const COLOR_RUTA = [231, 76, 60];       // rojo: linea del viaje activo
const COLOR_NIVEL = {
    5: [230, 126, 34],  // naranja: intercambio nivel 5
    6: [155, 89, 182]   // violeta: intercambio nivel 6
};

// nivel de intercambio segun el selector (puntos_menu.js)
function nivelDeNodo(titulo) {
    if (typeof data_puntos === "undefined") return 0;
    if ((data_puntos[6] || []).indexOf(titulo) !== -1) return 6;
    if ((data_puntos[5] || []).indexOf(titulo) !== -1) return 5;
    return 0;
}

// nombre limpio de una linea de la ruta planeada (soporta marcadores #o_/#d_)
function nombreDeLinea(linea) {
    for (let parte of linea.split("#")) {
        const p = parte.trim().toUpperCase();
        if (p !== "" && !p.startsWith("O_") && !p.startsWith("D_")) return p;
    }
    return "";
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
        this.nivel = 0;
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

    dibujar(hover, planeado) {
        const xd = this.pantallaX();
        const yd = this.pantallaY();
        const d = this.diametro() * (hover ? 1.25 : 1);

        // halo dorado si esta en la ruta planeada
        if (planeado) {
            noFill();
            stroke(212, 175, 55, 220);
            strokeWeight(Math.max(2, d * 0.12));
            ellipse(xd, yd, d + 9, d + 9);
        }

        const base = this.seleccionado ? COLOR_SELECCION : (COLOR_NIVEL[this.nivel] || COLOR_NODO);
        if (hover) { stroke(255); strokeWeight(2); }
        else { stroke(10, 20, 40, 160); strokeWeight(1); }
        fill(base[0], base[1], base[2]);
        ellipse(xd, yd, d, d);

        // numero de nivel dentro del circulo
        if (this.nivel && d >= 13) {
            noStroke();
            fill(255);
            textAlign(CENTER, CENTER);
            textSize(Math.max(8, d * 0.42));
            text(this.nivel, xd, yd + 1);
        }

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
function mouseReleased(event) {
    if (mouseY < 0 || mouseY > height || mouseX < 0 || mouseX > width) return;
    const fueClick = mouseClickV && dist(mouseX, mouseY, mouseClickV.x, mouseClickV.y) < 6;
    mouseMove = false;
    if (fueClick && hoverNodo) toggleNodoPlaneado(hoverNodo.titulo);
    ultimoMovimiento = millis();
}

function mousePressed(event) {
    if (mouseY < 0 || mouseY > height || mouseX < 0 || mouseX > width) return;
    if (event.buttons === 1) {
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
    data = loadJSON("datos.json");
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

    // Cargar nodos desde datos
    for (let i = 0, dnodo = data[i]; dnodo !== undefined; i++, dnodo = data[i]) {
        let nnodo = new NodoM(dnodo["x"], dnodo["y"]);
        nnodo.titulo = dnodo["titulo"];
        nnodo.terminado = true;
        nnodo.nivel = nivelDeNodo(nnodo.titulo);
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
    // framerate adaptativo: fluido al interactuar, liviano en reposo
    if (mouseMove || millis() - ultimoMovimiento < 1800) frameRate(30);
    else frameRate(8);

    // Fondo de océano estilizado
    background(10, 20, 40);
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

    // Actualizar offset si se está arrastrando
    if (mouseMove) {
        offsetX = mox + (mouseX - mouseClickV.x);
        offsetY = moy + (mouseY - mouseClickV.y);
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
    for (let nodo of nodosM) {
        if (nodo !== hoverNodo) nodo.dibujar(false, planeados.has(nodo.titulo));
    }
    if (hoverNodo) hoverNodo.dibujar(true, planeados.has(hoverNodo.titulo));

    // 3) Números de orden del viaje activo
    if (recNodos.length > 2) {
        textAlign(CENTER, CENTER);
        textSize(11);
        const sep = Math.max(9, 30 * zoomValue) * 0.9 + 4;
        for (let j = 1; j < recNodos.length - 1; j++) {
            noStroke();
            fill(10, 20, 40, 230);
            ellipse(px(recNodos[j]), py(recNodos[j]) - sep, 18, 18);
            fill(231, 76, 60);
            text(j, px(recNodos[j]), py(recNodos[j]) - sep + 1);
        }
    }

    cursor(hoverNodo ? HAND : (mouseMove ? "grabbing" : ARROW));

    // Cancelar arrastre si el mouse salió del canvas
    if (!dentro) mouseMove = false;

    noStroke();
}
