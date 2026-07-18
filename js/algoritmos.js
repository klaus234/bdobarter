// Algoritmos DP de rutas (perfecto y con dependencias)
// (extraído de index.html sin cambios de lógica)

// Rutas V2.
// ============================================
// ALGORITMO 100% PERFECTO (Programación Dinámica / Held-Karp Modificado)
// ============================================
function calcularRutaPerfectaDP(nodosPendientes, inicial, maxNodosPViaje) {
    const N = nodosPendientes.length;
    if (N === 0) return [];

    // Precalcular matriz de distancias para máxima velocidad
    // Índice 0 es la base (inicial), Índices 1 a N son las islas pendientes
    const todos = [inicial, ...nodosPendientes];
    const dist = Array(N + 1).fill(0).map(() => Array(N + 1).fill(0));
    for (let i = 0; i <= N; i++) {
        for (let j = 0; j <= N; j++) {
            dist[i][j] = todos[i].distancia(todos[j]);
        }
    }

    // Mapa para memorizar estados y evitar recalcular (Aquí está la magia contra el O(N!))
    const memo = new Map();

    // Función recursiva con Memoización
    // mask: Islas ya visitadas (en bits)
    // curr: Dónde está el barco ahora mismo (índice)
    // load: Cuántos intercambios lleva en el viaje actual
    function resolver(mask, curr, load) {
        // Caso base: Si ya visitamos todos los nodos, hay que volver a la base
        if (mask === (1 << N) - 1) {
            return { cost: dist[curr][0], path: [0] };
        }

        // Crear una clave única para este estado
        const stateKey = `${mask}-${curr}-${load}`;
        if (memo.has(stateKey)) return memo.get(stateKey);

        let bestCost = Infinity;
        let bestPath = [];

        // Opción 1: El barco se llenó. OBLIGATORIO volver a la base y empezar un viaje nuevo.
        if (load === maxNodosPViaje) {
            let res = resolver(mask, 0, 0); 
            let cost = dist[curr][0] + res.cost;
            if (cost < bestCost) {
                bestCost = cost;
                bestPath = [0, ...res.path];
            }
        } 
        // Opción 2: El barco tiene espacio. Revisamos todas las islas no visitadas.
        else {
            for (let i = 1; i <= N; i++) {
                // Comprobamos bit a bit si la isla 'i' NO ha sido visitada
                if ((mask & (1 << (i - 1))) === 0) {
                    // Marcamos la isla como visitada añadiéndola a la máscara de bits
                    let nextMask = mask | (1 << (i - 1));
                    let res = resolver(nextMask, i, load + 1);
                    
                    let cost = dist[curr][i] + res.cost;
                    if (cost < bestCost) {
                        bestCost = cost;
                        bestPath = [i, ...res.path];
                    }
                }
            }
        }

        const result = { cost: bestCost, path: bestPath };
        memo.set(stateKey, result);
        return result;
    }

    // Ejecutamos el algoritmo saliendo desde la Base (0), con 0 islas visitadas y carga 0
    const finalResult = resolver(0, 0, 0);

    // --- Reconstrucción de los Viajes para el Renderizador ---
    let rutaFinal = [];
    let viajeActual = [inicial];
    
    for (let i = 0; i < finalResult.path.length; i++) {
        let idx = finalResult.path[i];
        let nodo = todos[idx];
        
        if (idx === 0) { // Si el paso es volver a la base
            viajeActual.push(inicial);
            rutaFinal.push(viajeActual);
            // Si no es el último viaje, preparamos el siguiente barco
            if (i !== finalResult.path.length - 1) {
                viajeActual = [inicial];
            }
        } else {
            viajeActual.push(nodo); // Si es una isla, la agregamos al viaje
        }
    }

    return rutaFinal;
}


// ============================================
// ALGORITMO DP CON DEPENDENCIAS CORREGIDO
// ============================================
function calcularRutaConCadenasDP(nodosRawStrings, inicial, maxNodosPViaje, nodosDic) {
    console.log("calculando con cadenas DP")
    // --- 1. PARSER REFORZADO: Filtrar vacíos y validar existencia ---
    let nodosReales = [];
    let rawStringsFiltrados = [];

    for (let i = 0; i < nodosRawStrings.length; i++) {
        let raw = nodosRawStrings[i].trim();
        if (raw === "") continue;

        let parts = raw.split('#');
        let nombre = "";
        
        // Encontrar el nombre real limpio
        for (let p of parts) {
            let pLower = p.toLowerCase().trim();
            if (!pLower.startsWith('o_') && !pLower.startsWith('d_')) {
                nombre = p.trim();
                break;
            }
        }

        if (nombre in nodosDic) {
            nodosReales.push(nodosDic[nombre]);
            rawStringsFiltrados.push(raw);
        } else {
            console.warn(`Nodo ignorado/no encontrado: ${nombre}`);
        }
    }

    const N = nodosReales.length;
    if (N === 0) return [];

    let requerimientos = Array(N + 1).fill(0);
    let origenes = {};

    // Mapear llaves (orígenes) utilizando el índice real alineado
    for (let i = 0; i < N; i++) {
        let parts = rawStringsFiltrados[i].split('#');
        for (let p of parts) {
            let pLower = p.toLowerCase().trim();
            if (pLower.startsWith('o_')) {
                let id = pLower.split('_')[1];
                origenes[id] = (1 << i);
            }
        }
    }

    // Mapear candados (destinos) utilizando el índice real alineado
    for (let i = 0; i < N; i++) {
        let parts = rawStringsFiltrados[i].split('#');
        for (let p of parts) {
            let pLower = p.toLowerCase().trim();
            if (pLower.startsWith('d_')) {
                let id = pLower.split('_')[1];
                if (origenes[id] !== undefined) {
                    requerimientos[i + 1] |= origenes[id]; 
                }
            }
        }
    }

    // --- 2. MATRIZ DE DISTANCIAS ---
    const todos = [inicial, ...nodosReales];
    const dist = Array(N + 1).fill(0).map(() => Array(N + 1).fill(0));
    for (let i = 0; i <= N; i++) {
        for (let j = 0; j <= N; j++) {
            dist[i][j] = todos[i].distancia(todos[j]);
        }
    }

    const memo = new Map();

    // --- 3. MOTOR DP CON ÁRBOL DE DECISIÓN FLEXIBLE ---
    function resolver(mask, curr, load) {
        if (mask === (1 << N) - 1) {
            return { cost: dist[curr][0], path: [0] };
        }

        const stateKey = `${mask}-${curr}-${load}`;
        if (memo.has(stateKey)) return memo.get(stateKey);

        let bestCost = Infinity;
        let bestPath = [];

        // Opción A: Considerar volver a la base (Permitido siempre que estemos en una isla)
        if (curr !== 0 && load > 0) {
            let res = resolver(mask, 0, 0); 
            let cost = dist[curr][0] + res.cost;
            if (cost < bestCost) {
                bestCost = cost;
                bestPath = [0, ...res.path];
            }
        } 

        // Opción B: Considerar visitar una isla nueva (Permitido si el barco tiene espacio)
        if (load < maxNodosPViaje) {
            for (let i = 1; i <= N; i++) {
                let bitIsla = 1 << (i - 1);
                
                if ((mask & bitIsla) === 0) {
                    let req = requerimientos[i];
                    
                    if ((mask & req) === req) { 
                        let res = resolver(mask | bitIsla, i, load + 1);
                        let cost = dist[curr][i] + res.cost;
                        if (cost < bestCost) {
                            bestCost = cost;
                            bestPath = [i, ...res.path];
                        }
                    }
                }
            }
        }

        const result = { cost: bestCost, path: bestPath };
        memo.set(stateKey, result);
        return result;
    }

    const finalResult = resolver(0, 0, 0);

    if (finalResult.cost === Infinity) {
        alert("Ruta imposible: Hay un bucle de correlatividades o restricciones que no se pueden cumplir.");
        return [];
    }

    // --- 4. RECONSTRUCCIÓN COMPLETAMENTE LIMPIA PARA LA INTERFAZ ---
    let rutaFinal = [];
    let viajeActual = [inicial];
    
    for (let i = 0; i < finalResult.path.length; i++) {
        let idx = finalResult.path[i];
        
        if (idx === 0) {
            viajeActual.push(inicial);
            rutaFinal.push(viajeActual);
            if (i !== finalResult.path.length - 1) {
                viajeActual = [inicial];
            }
        } else {
            // Usamos directamente el nodo real del diccionario para conservar su nombre limpio
            viajeActual.push(todos[idx]);
        }
    }

    return rutaFinal;
}
// FIN Rutas v2
