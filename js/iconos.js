// Íconos SVG: helper para el contenido que se arma desde JS.
// El sprite con los <symbol id="ic-..."> está al inicio del <body> de index.html.
// Se pintan con currentColor, así heredan el color del contexto donde se usan.
function icono(nombre) {
    return '<svg class="ic" aria-hidden="true"><use href="#ic-' + nombre + '"></use></svg>';
}
