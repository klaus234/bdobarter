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

let data = [];
const nodosM = [];

let szFixX = 0.866;
let szFixY = 0.866;
let szFixOX = -170;
let szFixOY = -80;

let recNodos = [];
class NodoM
{
    constructor(x, y)
    {
        this.x = x;
        this.y = y;
        this.titulo = "";
        this.terminado = false;
        this.seleccionado = false;
    }
    dibujar()
    {
        const xd = this.x * szFixX + szFixOX;
        const yd = this.y * szFixY + szFixOY;
        if(!this.seleccionado)
            fill(0, 0, 255);
        else
            fill(0, 255, 0)
        ellipse(xd + offsetX, yd + offsetY, 30, 30);
        textAlign(CENTER);
        fill(0);
        text(this.titulo, xd + offsetX - 3, yd + 30 + offsetY - 3);
        if(!this.terminado)
            fill(0, 0, 255);
        else
            fill(255);

        text(this.titulo, xd  + offsetX, yd + 30 + offsetY);
    }
}



function mouseReleased(event)
{

    if(mouseY < 0 || mouseY > height || mouseX < 0 || mouseX > width) return;
    if(event.buttons == 0)
    {
        mouseMove = false;
    }
    frameRate(1);
}
function mousePressed(event)
{
    if(mouseY < 0 || mouseY > height || mouseX < 0 || mouseX > width) return;
    if(event.buttons == 1)
    {
        mouseMove = true;
        mouseClickV.x = mouseX
        mouseClickV.y = mouseY
        mox = offsetX;
        moy = offsetY;
        console.log("OK!");
    }
    frameRate(30);
}
function preload()
{
    //img = loadImage("imgfondo_b.jpg");
    data = loadJSON("datos.json");
}
function setup()
{
    let canvas = createCanvas(640, 480);
    mouseClickV = createVector(0, 0);
    frameRate(30);
    textSize(16);
    textStyle(BOLD);
    canvas.parent("mapa");

    for(let i = 0, dnodo = data[i]; dnodo != undefined; i++, dnodo = data[i])
   {
       let nnodo = new NodoM(dnodo["x"], dnodo["y"]);
       nnodo.titulo = dnodo["titulo"];
       nnodo.terminado = true;
       nodosM.push(nnodo);
   }
}
function draw()
{
    background(0);
    if(mouseMove)
    {
        offsetX = mox + (mouseX - mouseClickV.x);
        offsetY = moy + (mouseY - mouseClickV.y);
    }
    //image(img, offsetX -1950, offsetY - 950);
    for(nodo of nodosM)
        nodo.dibujar();
    
    let sx = 0;
    let sy = 0;
    if(recNodos.length > 1)
    {
        
        let punto = recNodos[0];
        sx = punto.x * szFixX + szFixOX;
        sy = punto.y * szFixY + szFixOY;

    }
    strokeWeight(8);
    stroke(255, 0, 0);
    let c = 1;
    for(let i = 1; i < recNodos.length; i++)
    {
        let punto = recNodos[i];
        const asx = punto.x * szFixX + szFixOX;
        const asy = punto.y * szFixY + szFixOY;
        line(sx + offsetX, sy + offsetY, asx + offsetX, asy +  + offsetY);
        text(c, sx + offsetX, sy + offsetY + 5);
        sx = asx;
        sy = asy;
        c++;

    }
    /*
    text(mouseX, width / 2, height - 30);
    text(mouseY, width / 2 + 40, height - 30);
    */

   

    if(mouseX < 0 || mouseY < 0 || mouseX > width || mouseY > height)
        mouseMove = false;
    noStroke();
    
    
}
