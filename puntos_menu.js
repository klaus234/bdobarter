const menu_puntos = document.getElementById("contenedor-puntos");
let fload = true;
const data_puntos = 

{
   4 : ["ILIYA", "AJIR", "PUJARA", "NARVO", "BAREMI", "ORFFS", "OBEN", "PADIX", "THEONIL", "RAMEDA", "BALVEGE", "PILAVA"],
   3 : ["ALNAHA", "TULU", "LISZ", "DATON", "TIGRIS", "ALMAI", "SHASHA", "ROSEVAN", "ORISHA", "SHIRNA", "TEYAMAL"]
}
function nuevoNivel(num)
{
    const li = document.createElement("li");
    li.innerText = "Nivel " + num;
    li.menulvl = num;

    li.onclick = menu_cargar_puntos;
    return li;
}
function nuevoPunto(nombre)
{
    const li = document.createElement("li");
    li.innerText = nombre;
    li.className = "puntomenu"
    li.onclick = function()
    {
        const nodosm_area = document.getElementById("nodosm");
        nodosm_area.value += this.innerText + "\n";
    }
    return li;
}
function menu_cargar_puntos()
{
    menu_puntos.innerHTML = "";
    const atras = document.createElement("li");
    atras.innerText = "<< Atras";
    atras.style = "color: red;";
    atras.className = "puntomenu";
    atras.onclick = function()
    {
        mostrarNiveles();
    }
    menu_puntos.appendChild(atras);

    data_puntos[this.menulvl].map((elemento) =>
    {
        menu_puntos.appendChild(nuevoPunto(elemento));
    });

    
}
function mostrarNiveles()
{    
    menu_puntos.innerHTML = "";
    menu_puntos.appendChild(nuevoNivel(1));
    menu_puntos.appendChild(nuevoNivel(2));
    menu_puntos.appendChild(nuevoNivel(3));
    menu_puntos.appendChild(nuevoNivel(4));
    if (fload)
    {
        for(d of Object.keys(data_puntos))
        {
            data_puntos[d].sort();
        }
        fload = false;
    }
}
mostrarNiveles();
