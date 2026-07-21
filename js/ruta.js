// Módulo Ruta: lista visual de nodos + dependencias
// (extraído de index.html sin cambios de lógica)

// ============================================
// MÓDULO RUTA: lista visual de nodos + dependencias
// El modelo estructurado [{name, deps:[]}] es la fuente de verdad;
// el textarea #nodosm se mantiene sincronizado con los marcadores
// #o_/#d_ para que el motor DP, el mapa y localStorage sigan igual.
// ============================================
const Ruta = (function () {
    let modelo = [];
    let lista, vacia, area, wrap, chk;

    function existeEnDic(nombre) {
        return typeof nodosDic === "undefined"
            || Object.keys(nodosDic).length === 0
            || (nombre in nodosDic);
    }

    function idx(nombre) { return modelo.findIndex(n => n.name === nombre); }

    // ¿'a' depende (directa o transitivamente) de 'b'? Sirve para no crear ciclos.
    function dependeTransitivo(a, b) {
        const visto = {};
        const pila = [a];
        while (pila.length) {
            const nd = modelo[idx(pila.pop())];
            if (!nd) continue;
            for (const d of nd.deps) {
                if (d === b) return true;
                if (!visto[d]) { visto[d] = 1; pila.push(d); }
            }
        }
        return false;
    }

    // Nodos que se pueden ofrecer como "después de" para el nodo i sin generar ciclos.
    // Los separadores (SEP) no participan de las dependencias.
    function candidatos(i) {
        const self = modelo[i];
        return modelo
            .filter((n, j) => j !== i && !n.sep
                && self.deps.indexOf(n.name) === -1
                && !dependeTransitivo(n.name, self.name))
            .map(n => n.name);
    }

    // modelo -> texto con marcadores #o_/#d_
    function serializar() {
        const ids = {}; let next = 1;
        modelo.forEach(n => n.deps.forEach(dep => {
            if (idx(dep) !== -1 && !ids[dep]) ids[dep] = next++;
        }));
        return modelo.map(n => {
            if (n.sep) return "SEP";
            let s = n.name;
            if (ids[n.name]) s += "#o_" + ids[n.name];
            n.deps.forEach(dep => { if (ids[dep]) s += "#d_" + ids[dep]; });
            return s;
        }).join("\n");
    }

    // texto con marcadores #o_/#d_ -> modelo
    function parsear(texto) {
        const crudo = (texto || "").split("\n").map(l => l.trim()).filter(l => l !== "")
            .map(raw => {
                const parts = raw.split("#");
                let name = "", oid = [], did = [];
                for (const p of parts) {
                    const pl = p.trim().toLowerCase();
                    if (pl.startsWith("o_")) oid.push(pl.split("_")[1]);
                    else if (pl.startsWith("d_")) did.push(pl.split("_")[1]);
                    else if (p.trim() !== "" && name === "") name = p.trim().toUpperCase();
                }
                return { name, oid, did };
            }).filter(x => x.name !== "");

        const id2name = {};
        crudo.forEach(x => { if (x.name !== "SEP") x.oid.forEach(id => { id2name[id] = x.name; }); });

        const vistos = {}, res = [];
        crudo.forEach(x => {
            if (x.name === "SEP") { res.push({ name: "SEP", sep: true, deps: [] }); return; }
            if (vistos[x.name]) return; // sin duplicados (los SEP sí pueden repetirse)
            vistos[x.name] = 1;
            let deps = x.did.map(id => id2name[id]).filter(n => n && n !== x.name);
            deps = deps.filter((n, i) => deps.indexOf(n) === i);
            res.push({ name: x.name, deps });
        });
        return res;
    }

    function sincronizar() {
        // No pisar el textarea si el usuario lo está editando (modo avanzado).
        if (area && document.activeElement !== area) area.value = serializar();
        if (chk) chk.checked = modelo.some(n => n.deps.length > 0);
    }

    function render() {
        if (!lista) return;
        lista.innerHTML = "";
        if (vacia) vacia.style.display = modelo.length ? "none" : "block";

        modelo.forEach((nd, i) => {
            const li = document.createElement("li");
            li.className = "ruta-item";
            li.draggable = true;
            li.dataset.i = i;

            const grip = document.createElement("span");
            grip.className = "ruta-grip";
            grip.textContent = "⠿";
            grip.setAttribute("aria-hidden", "true");

            // Separador: fila divisoria que corta el viaje (solo en Modo Manual)
            if (nd.sep) {
                li.classList.add("ruta-sep");
                const etiqueta = document.createElement("span");
                etiqueta.className = "ruta-sep-label";
                etiqueta.textContent = "✂ Separador · corta el viaje (Modo Manual)";
                const delSep = document.createElement("button");
                delSep.className = "ruta-del";
                delSep.type = "button";
                delSep.setAttribute("aria-label", "Quitar separador");
                delSep.textContent = "✕";
                li.append(grip, etiqueta, delSep);
                lista.appendChild(li);
                return;
            }

            const nombre = document.createElement("span");
            nombre.className = "ruta-nombre";
            nombre.textContent = nd.name;

            const deps = document.createElement("div");
            deps.className = "ruta-deps";
            const cand = candidatos(i);
            if (nd.deps.length || cand.length) {
                const et = document.createElement("span");
                et.className = "dep-label";
                et.textContent = "después de";
                deps.appendChild(et);

                nd.deps.forEach(dep => {
                    const chip = document.createElement("span");
                    chip.className = "dep-chip";
                    const txt = document.createTextNode(dep + " ");
                    const x = document.createElement("span");
                    x.className = "dep-x";
                    x.dataset.quita = dep;
                    x.setAttribute("aria-label", "Quitar dependencia de " + dep);
                    x.textContent = "✕";
                    chip.append(txt, x);
                    deps.appendChild(chip);
                });

                if (cand.length) {
                    const sel = document.createElement("select");
                    sel.className = "dep-add";
                    sel.innerHTML = '<option value="">＋ …</option>'
                        + cand.map(c => '<option value="' + c + '">' + c + '</option>').join("");
                    deps.appendChild(sel);
                }
            }

            const del = document.createElement("button");
            del.className = "ruta-del";
            del.type = "button";
            del.dataset.del = nd.name;
            del.setAttribute("aria-label", "Quitar " + nd.name);
            del.textContent = "✕";

            li.append(grip, nombre, deps, del);
            lista.appendChild(li);
        });
    }

    function actualizar() { render(); sincronizar(); }

    function agregar(nombre) {
        nombre = (nombre || "").trim().toUpperCase();
        if (!nombre) return;
        // SEP: separador de viaje (se permiten varios, no se valida contra nodosDic)
        if (nombre === "SEP") { modelo.push({ name: "SEP", sep: true, deps: [] }); actualizar(); return; }
        if (!existeEnDic(nombre)) { console.warn("Nodo desconocido:", nombre); return; }
        if (idx(nombre) === -1) modelo.push({ name: nombre, deps: [] });
        actualizar();
    }

    // quita la entrada en la posición i (nodo o separador), limpiando deps
    function quitarIdx(i) {
        const q = modelo[i];
        if (!q) return;
        modelo.splice(i, 1);
        if (!q.sep) modelo.forEach(n => { n.deps = n.deps.filter(d => d !== q.name); });
        actualizar();
    }

    function quitar(nombre) {
        const i = idx(nombre);
        if (i === -1) return;
        modelo.splice(i, 1);
        modelo.forEach(n => { n.deps = n.deps.filter(d => d !== nombre); });
        actualizar();
    }

    function toggle(nombre) {
        nombre = (nombre || "").trim().toUpperCase();
        if (idx(nombre) === -1) agregar(nombre); else quitar(nombre);
    }

    function limpiar() { modelo = []; actualizar(); }
    function planeados() { return modelo.filter(n => !n.sep).map(n => n.name); }
    function cargarTexto(texto) { modelo = parsear(texto || ""); actualizar(); }

    function init() {
        lista = document.getElementById("rutaLista");
        vacia = document.getElementById("rutaVacia");
        area = document.getElementById("nodosm");
        wrap = document.getElementById("textoAvanzadoWrap");
        chk = document.getElementById("chkDependencias");

        modelo = parsear(localStorage.getItem("NodosR") || "");
        actualizar();

        lista.addEventListener("change", e => {
            const sel = e.target.closest(".dep-add");
            if (!sel) return;
            const i = +sel.closest(".ruta-item").dataset.i;
            if (sel.value && modelo[i].deps.indexOf(sel.value) === -1) modelo[i].deps.push(sel.value);
            actualizar();
        });

        lista.addEventListener("click", e => {
            const x = e.target.closest(".dep-x");
            if (x) {
                const i = +x.closest(".ruta-item").dataset.i;
                modelo[i].deps = modelo[i].deps.filter(d => d !== x.dataset.quita);
                actualizar();
                return;
            }
            const del = e.target.closest(".ruta-del");
            if (del) quitarIdx(+del.closest(".ruta-item").dataset.i);
        });

        // Reordenar arrastrando
        let dragI = null;
        lista.addEventListener("dragstart", e => {
            const li = e.target.closest(".ruta-item");
            if (!li) return;
            dragI = +li.dataset.i;
            li.classList.add("dragging");
        });
        lista.addEventListener("dragend", e => {
            const li = e.target.closest(".ruta-item");
            if (li) li.classList.remove("dragging");
            dragI = null;
        });
        lista.addEventListener("dragover", e => e.preventDefault());
        lista.addEventListener("drop", e => {
            e.preventDefault();
            const li = e.target.closest(".ruta-item");
            if (!li || dragI === null) return;
            const to = +li.dataset.i;
            if (to === dragI) return;
            const m = modelo.splice(dragI, 1)[0];
            modelo.splice(to, 0, m);
            actualizar();
        });

        // Alternar el textarea de texto avanzado
        const btn = document.getElementById("btnTextoAvanzado");
        btn.addEventListener("click", () => {
            const abierto = wrap.style.display !== "none";
            if (abierto) {
                modelo = parsear(area.value);
                actualizar();
                wrap.style.display = "none";
                btn.classList.remove("activo");
            } else {
                sincronizar();
                wrap.style.display = "block";
                btn.classList.add("activo");
            }
        });
        area.addEventListener("blur", () => {
            if (wrap.style.display !== "none") { modelo = parsear(area.value); actualizar(); }
        });
    }

    return { init, agregar, quitar, toggle, limpiar, planeados, sincronizar, cargarTexto };
})();
window.Ruta = Ruta;
