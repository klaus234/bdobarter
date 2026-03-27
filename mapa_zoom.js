// ============================================
// VARIABLES DE ESTADO DEL MAPA
// ============================================
let offsetX = 0;
let offsetY = 0;
let mox = 0;
let moy = 0;
let moveDown = false;
let moveUp = false;
let moveLeft = false;
let moveRight = false;
let mouseMove = false;
let mouseClickV;

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

    dibujar() {
        const xd = (this.x * szFixX + szFixOX) * zoomValue;
        const yd = (this.y * szFixY + szFixOY) * zoomValue;
        
        // Dibujar círculo
        if (!this.seleccionado)
            fill(52, 152, 219); // Azul
        else
            fill(46, 204, 113); // Verde

        ellipse(xd + offsetX, yd + offsetY, 30 * zoomValue, 30 * zoomValue);

        // Dibujar sombra de texto
        textAlign(CENTER);
        fill(0, 0, 0, 100);
        textSize(12);
        text(this.titulo, xd + offsetX - 2, yd + 32 + offsetY - 2);

        // Dibujar texto
        if (!this.terminado)
            fill(52, 152, 219);
        else
            fill(255);

        text(this.titulo, xd + offsetX, yd + 30 + offsetY);
    }
}

// ============================================
// EVENTOS DEL RATÓN
// ============================================
function mouseReleased(event) {
    if (mouseY < 0 || mouseY > height || mouseX < 0 || mouseX > width) return;
    if (event.buttons === 0) {
        mouseMove = false;
    }
    frameRate(5);
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
    frameRate(30);
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
        nodosM.push(nnodo);
    }
}

// ============================================
// DIBUJO - LOOP PRINCIPAL
// ============================================
function draw() {
    // Dibujar fondo de océano estilizado
    background(10, 20, 40); // Azul marino oscuro
    
    // Agregar efecto de agua con líneas sutiles
    stroke(20, 40, 80, 100);
    strokeWeight(1);
    
    // Líneas de onda horizontales para efecto de agua
    for (let y = offsetY % 40; y < height; y += 40) {
        line(0, y, width, y);
    }
    // Líneas verticales para efecto de agua
    for (let x = offsetX % 40; x < width; x += 40) {
        line(x, 0, x, height);
    }
    
    // Agregar algunos puntos de luz (como reflejos de luz en el agua)
    fill(50, 100, 150, 50);
    noStroke();
    randomSeed(42); // Para que los puntos sean consistentes
    for (let i = 0; i < 30; i++) {
        let px = random(width);
        let py = random(height);
        ellipse(px, py, random(2, 8), random(2, 8));
    }
    
    // Actualizar offset si se está arrastrando
    if (mouseMove) {
        offsetX = mox + (mouseX - mouseClickV.x);
        offsetY = moy + (mouseY - mouseClickV.y);
    }

    // Dibujar todos los nodos
    for (nodo of nodosM)
        nodo.dibujar();

    // Dibujar ruta si existe
    if (recNodos.length > 1) {
        let sx = 0;
        let sy = 0;
        
        let punto = recNodos[0];
        sx = (punto.x * szFixX + szFixOX) * zoomValue;
        sy = (punto.y * szFixY + szFixOY) * zoomValue;

        strokeWeight(6);
        let c = 0;
        for (let i = 1; i < recNodos.length; i++) {
            let punto = recNodos[i];
            const asx = (punto.x * szFixX + szFixOX) * zoomValue;
            const asy = (punto.y * szFixY + szFixOY) * zoomValue;
            
            stroke(231, 76, 60); // Rojo
            line(sx + offsetX, sy + offsetY, asx + offsetX, asy + offsetY);
            
            // Dibujar número de orden
            noStroke();
            textSize(14);
            textStyle(NORMAL);
            fill(255);
            textAlign(CENTER, CENTER);
            if (c !== 0) {
                text(c, sx + offsetX, sy + offsetY);
            }
            
            sx = asx;
            sy = asy;
            c++;
        }
    }

    // Ocultar cursor si está fuera
    if (mouseX < 0 || mouseY < 0 || mouseX > width || mouseY > height)
        mouseMove = false;
    
    noStroke();
}
