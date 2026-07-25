// ============================================
// RETRASOS LOCALES (compartido por index.html y calculadora_retraso.html)
//
// data/retrasos.json trae los retrasos "de fábrica". Encima de eso el usuario
// puede guardar los suyos en el navegador (localStorage): los locales AGREGAN
// pares nuevos y PISAN los del archivo cuando coinciden.
// Con "Generar retrasos.json" se obtiene el archivo ya fusionado, para poder
// actualizar data/retrasos.json de verdad.
// ============================================
const RetrasosLocal = (function () {
    const CLAVE = "RetrasosLocal";

    // clave simétrica: el retraso A→B vale igual para B→A
    function clave(a, b) {
        return [String(a).toUpperCase().trim(), String(b).toUpperCase().trim()].sort().join("|");
    }

    function leer() {
        try {
            const v = JSON.parse(localStorage.getItem(CLAVE));
            return Array.isArray(v) ? v : [];
        } catch (e) {
            return [];
        }
    }

    function escribir(lista) {
        localStorage.setItem(CLAVE, JSON.stringify(lista));
    }

    // agrega el par o reemplaza su retraso si ya estaba guardado
    function guardar(nodoA, nodoB, retraso) {
        const lista = leer();
        const k = clave(nodoA, nodoB);
        const entrada = {
            nodoA: String(nodoA).toUpperCase().trim(),
            nodoB: String(nodoB).toUpperCase().trim(),
            retraso: Math.round(retraso)
        };
        const i = lista.findIndex(r => clave(r.nodoA, r.nodoB) === k);
        if (i === -1) lista.push(entrada); else lista[i] = entrada;
        escribir(lista);
        return entrada;
    }

    function borrar(nodoA, nodoB) {
        const k = clave(nodoA, nodoB);
        escribir(leer().filter(r => clave(r.nodoA, r.nodoB) !== k));
    }

    function borrarTodo() {
        localStorage.removeItem(CLAVE);
    }

    function buscar(lista, nodoA, nodoB) {
        const k = clave(nodoA, nodoB);
        return (lista || []).find(r => clave(r.nodoA, r.nodoB) === k) || null;
    }

    // base (data/retrasos.json) + locales encima
    function fusionar(base) {
        const out = (base || []).map(r => ({ nodoA: r.nodoA, nodoB: r.nodoB, retraso: r.retraso }));
        for (const loc of leer()) {
            const k = clave(loc.nodoA, loc.nodoB);
            const i = out.findIndex(r => clave(r.nodoA, r.nodoB) === k);
            const entrada = { nodoA: loc.nodoA, nodoB: loc.nodoB, retraso: loc.retraso };
            if (i === -1) out.push(entrada); else out[i] = entrada;
        }
        return out;
    }

    // texto con el mismo formato que data/retrasos.json (una entrada por línea)
    function formatear(lista) {
        if (!lista || lista.length === 0) return "[]\n";
        return "[\n" + lista
            .map(r => `    {"nodoA": "${r.nodoA}", "nodoB": "${r.nodoB}", "retraso": ${r.retraso}}`)
            .join(",\n") + "\n]\n";
    }

    // contenido del retrasos.json actualizado con los locales
    function generarJSON(base) {
        return formatear(fusionar(base));
    }

    return { clave, leer, guardar, borrar, borrarTodo, buscar, fusionar, formatear, generarJSON };
})();
