/* ============================================
   EMA - Control de Operadores y Gasolina
   Código sencillo, claro y funcional
============================================ */

(function() {
    'use strict';

    // ---------- CONFIGURACIÓN ----------
    const CLAVE_STORAGE = 'ema_datos_v1';
    const REGISTROS_POR_PAGINA = 15;

    // ---------- ESTADO ----------
    const estado = {
        registros: [],
        archivos: [],
        vistaActiva: 'resumen',
        paginaActual: 1,
        filtroGasolina: null,
        busqueda: '',
        tema: 'light',
        graficos: {}
    };

    // ---------- UTILIDADES ----------
    const $ = (id) => document.getElementById(id);
    const esc = (v) => {
        if (v == null) return '';
        return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };
    const num = (v) => {
        if (typeof v === 'number') return isFinite(v) ? v : 0;
        if (!v) return 0;
        const n = parseFloat(String(v).replace(/,/g, '.'));
        return isFinite(n) ? n : 0;
    };
    const fmt = (v, d = 0) => Number(v || 0).toLocaleString('es-GT', { minimumFractionDigits: d, maximumFractionDigits: d });
    const generarId = () => 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

    // ---------- INICIO ----------
    function iniciar() {
        cargarDatos();
        configurarCarga();
        configurarEventos();
        
        if (estado.registros.length > 0) {
            $('pantallaInicio').style.display = 'none';
            $('app').classList.add('activa');
        }
        
        aplicarTema(estado.tema);
        actualizarTodo();
    }

    // ---------- ALMACENAMIENTO ----------
    function cargarDatos() {
        try {
            const raw = localStorage.getItem(CLAVE_STORAGE);
            if (raw) {
                const d = JSON.parse(raw);
                estado.registros = d.registros || [];
                estado.archivos = d.archivos || [];
                estado.tema = d.tema || 'light';
            }
        } catch (e) { console.warn('Error cargando datos:', e); }
    }

    function guardarDatos() {
        try {
            localStorage.setItem(CLAVE_STORAGE, JSON.stringify({
                registros: estado.registros,
                archivos: estado.archivos,
                tema: estado.tema
            }));
            return true;
        } catch (e) {
            mostrarAviso('No se pudo guardar', 'error');
            return false;
        }
    }

    // ---------- PANTALLA INICIO ----------
    window.iniciarApp = function() {
        $('pantallaInicio').style.display = 'none';
        $('app').classList.add('activa');
        actualizarTodo();
    };

    window.cargarDatosDemo = function() {
        const nombres = ['CARLOS LÓPEZ', 'MARÍA PÉREZ', 'JOSÉ GARCÍA', 'ANA MORALES', 
                         'LUIS RAMÍREZ', 'SOFÍA CASTILLO', 'PEDRO MENDEZ', 'DANIEL HERNÁNDEZ'];
        const regiones = ['NORTE', 'SUR', 'CENTRO', 'ORIENTE', 'OCCIDENTE'];
        
        const base = new Date('2026-08-01');
        const nuevos = [];
        
        for (let i = 0; i < 80; i++) {
            const hi = +(5 + Math.random() * 7).toFixed(1);
            const ht = +(1.5 + Math.random() * 6).toFixed(2);
            const hf = +(hi + ht).toFixed(1);
            const conGas = Math.random() > 0.2;
            const gal = conGas ? +(10 + Math.random() * 35).toFixed(2) : 0;
            const f = new Date(base.getTime() + i * 3600000 * 5);
            
            nuevos.push({
                id: generarId(),
                fecha: f.toLocaleDateString('es-GT'),
                nombre: nombres[i % nombres.length],
                region: regiones[i % regiones.length],
                horasInicio: hi,
                horasFin: hf,
                combustible: conGas ? 'SI' : 'No',
                galones: gal,
                horasTrab: ht,
                fechaCreacion: Date.now()
            });
        }
        
        estado.registros = nuevos;
        estado.archivos = [{
            id: generarId(),
            nombre: 'datos_demo.xlsx',
            tamano: 0,
            fecha: Date.now(),
            registros: 80,
            hoja: 'Demo'
        }];
        
        guardarDatos();
        
        $('pantallaInicio').style.display = 'none';
        $('app').classList.add('activa');
        
        actualizarTodo();
        mostrarAviso('¡80 registros de ejemplo cargados!', 'exito');
    };

    // ---------- NAVEGACIÓN ----------
    window.cambiarVista = function(vista) {
        estado.vistaActiva = vista;
        estado.paginaActual = 1;
        
        document.querySelectorAll('.vista').forEach(v => v.classList.remove('activa'));
        $('vista-' + vista).classList.add('activa');
        
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('activo'));
        $('menu-' + vista).classList.add('activo');
        
        const titulos = {
            resumen: 'Resumen',
            registros: 'Registros',
            operadores: 'Operadores',
            archivos: 'Archivos'
        };
        $('tituloVista').textContent = titulos[vista] || vista;
        
        setTimeout(() => {
            if (vista === 'registros') renderizarRegistros();
            if (vista === 'operadores') renderizarOperadores();
            if (vista === 'archivos') renderizarArchivos();
        }, 50);
    };

    // ---------- TEMA ----------
    window.cambiarTema = function() {
        estado.tema = estado.tema === 'light' ? 'dark' : 'light';
        aplicarTema(estado.tema);
        guardarDatos();
        setTimeout(renderizarGraficos, 100);
    };

    function aplicarTema(tema) {
        document.documentElement.setAttribute('data-theme', tema);
        const icono = $('iconoTema');
        if (icono) icono.className = tema === 'light' ? 'ri-sun-line' : 'ri-moon-line';
    }

    // ---------- CARGA ARCHIVOS ----------
    function configurarCarga() {
        const zona = $('zonaCarga');
        const input = $('cargarArchivo');
        
        if (zona) {
            zona.addEventListener('click', () => input.click());
            zona.addEventListener('dragover', e => { e.preventDefault(); zona.classList.add('activa'); });
            zona.addEventListener('dragleave', () => zona.classList.remove('activa'));
            zona.addEventListener('drop', e => {
                e.preventDefault();
                zona.classList.remove('activa');
                procesarArchivos(e.dataTransfer.files);
            });
        }
        
        if (input) {
            input.addEventListener('change', e => {
                procesarArchivos(e.target.files);
                e.target.value = '';
            });
        }
    }

    function procesarArchivos(files) {
        for (const file of files) {
            const ext = file.name.split('.').pop().toLowerCase();
            if (!['xlsx', 'xls', 'csv'].includes(ext)) {
                mostrarAviso(`"${file.name}" no es un archivo Excel válido`, 'error');
                continue;
            }
            leerExcel(file);
        }
    }

    function leerExcel(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const wb = XLSX.read(data, { type: 'array', cellDates: true });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(ws, { header: 1 });
                
                const nuevos = procesarDatos(json);
                if (nuevos.length === 0) {
                    mostrarAviso(`"${file.name}": no se encontraron datos válidos`, 'aviso');
                    return;
                }
                
                estado.registros = estado.registros.concat(nuevos);
                estado.archivos.push({
                    id: generarId(),
                    nombre: file.name,
                    tamano: file.size,
                    fecha: Date.now(),
                    registros: nuevos.length,
                    hoja: wb.SheetNames[0]
                });
                
                guardarDatos();
                actualizarTodo();
                mostrarAviso(`"${file.name}": ${nuevos.length} registros importados`, 'exito');
                
            } catch (err) {
                console.error(err);
                mostrarAviso('Error al leer el archivo', 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function procesarDatos(jsonData) {
        const regs = [];
        let inicio = 0;
        
        // Detectar encabezado
        for (let r = 0; r < Math.min(jsonData.length, 20); r++) {
            const fila = (jsonData[r] || []).join(' ').toUpperCase();
            if (fila.includes('FECHA') && (fila.includes('NOMBRE') || fila.includes('REGION'))) {
                inicio = r + 1;
                break;
            }
        }
        
        for (let r = inicio; r < jsonData.length; r++) {
            const row = jsonData[r] || [];
            if (!row[0] && !row[1] && !row[2]) continue;
            
            const hi = num(row[3]);
            const hf = num(row[4]);
            const gal = num(row[6]);
            let ht = num(row[8]);
            if (!ht && (hi || hf)) {
                ht = hf >= hi ? hf - hi : (24 - hi) + hf;
            }
            
            const combustible = row[5] ? String(row[5]).toUpperCase().trim() : (gal > 0 ? 'SI' : 'No');
            
            const reg = {
                id: generarId(),
                fecha: row[0] ? String(row[0]) : new Date().toLocaleDateString('es-GT'),
                nombre: row[1] ? String(row[1]).trim().toUpperCase() : 'SIN NOMBRE',
                region: row[2] ? String(row[2]).trim().toUpperCase() : 'SIN REGIÓN',
                horasInicio: hi,
                horasFin: hf,
                combustible: combustible === 'SI' || combustible === 'SÍ' ? 'SI' : 'No',
                galones: gal,
                horasTrab: ht,
                fechaCreacion: Date.now()
            };
            
            if (reg.nombre !== 'SIN NOMBRE' || reg.region !== 'SIN REGIÓN') {
                regs.push(reg);
            }
        }
        
        return regs;
    }

    // ---------- ACTUALIZACIÓN GENERAL ----------
    function actualizarTodo() {
        const hay = estado.registros.length > 0;
        
        if ($('zonaCarga')) $('zonaCarga').style.display = hay ? 'none' : 'block';
        if ($('contenidoResumen')) $('contenidoResumen').style.display = hay ? 'block' : 'none';
        if ($('mensajeVacio')) $('mensajeVacio').style.display = hay ? 'none' : 'flex';
        
        if (hay) {
            actualizarResumen();
            renderizarGraficos();
            renderizarTopOperadores();
        }
        
        renderizarRegistros();
        renderizarOperadores();
        renderizarArchivos();
    }

    // ---------- RESUMEN ----------
    function actualizarResumen() {
        const r = estado.registros;
        
        $('totalRegistros').textContent = fmt(r.length);
        $('totalGalones').textContent = fmt(r.reduce((s, x) => s + num(x.galones), 0), 1);
        $('totalHoras').textContent = fmt(r.reduce((s, x) => s + num(x.horasTrab), 0), 1);
        
        const operadores = new Set(r.map(x => x.nombre).filter(Boolean));
        $('totalOperadores').textContent = fmt(operadores.size);
        
        const conGas = r.filter(x => x.combustible === 'SI').length;
        $('conGasolina').textContent = fmt(conGas);
        $('sinGasolina').textContent = fmt(r.length - conGas);
    }

    // ---------- GRÁFICOS ----------
    function renderizarGraficos() {
        if (estado.registros.length === 0) return;
        
        // Datos por región
        const pr = {};
        estado.registros.forEach(r => {
            const reg = r.region || 'SIN REGIÓN';
            if (!pr[reg]) pr[reg] = { galones: 0, horas: 0 };
            pr[reg].galones += num(r.galones);
            pr[reg].horas += num(r.horasTrab);
        });
        
        const labels = Object.keys(pr);
        const galData = labels.map(l => pr[l].galones);
        const horData = labels.map(l => pr[l].horas);
        
        const colores = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#dc2626', '#0891b2', '#65a30d', '#db2777'];
        const bg = labels.map((_, i) => colores[i % colores.length]);
        const bgT = labels.map((_, i) => colores[i % colores.length] + '33');
        
        // Destruir gráficos anteriores
        Object.values(estado.graficos).forEach(g => g?.destroy?.());
        estado.graficos = {};
        
        // Galones por región
        if ($('graficoGalones')) {
            estado.graficos.galones = new Chart($('graficoGalones'), {
                type: 'bar',
                data: { labels, datasets: [{ label: 'Galones', data: galData, backgroundColor: bg, borderRadius: 8 }] },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, grid: { color: document.documentElement.getAttribute('data-theme') === 'dark' ? '#334155' : '#f3f4f6' } } }
                }
            });
        }
        
        // Gasolina Sí/No
        if ($('graficoGasolina')) {
            const con = estado.registros.filter(r => r.combustible === 'SI').length;
            const sin = estado.registros.length - con;
            
            estado.graficos.gasolina = new Chart($('graficoGasolina'), {
                type: 'doughnut',
                data: {
                    labels: ['Con Gasolina', 'Sin Gasolina'],
                    datasets: [{ data: [con, sin], backgroundColor: ['#16a34a', '#9ca3af'], borderColor: '#fff', borderWidth: 3, hoverOffset: 10 }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '65%',
                    plugins: { legend: { position: 'bottom', labels: { padding: 20, font: { size: 13, weight: '600' } } } }
                }
            });
        }
        
        // Horas por región
        if ($('graficoHoras')) {
            estado.graficos.horas = new Chart($('graficoHoras'), {
                type: 'bar',
                data: { labels, datasets: [{ label: 'Horas', data: horData, backgroundColor: bgT, borderColor: bg, borderWidth: 2, borderRadius: 8 }] },
                options: {
                    responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                    plugins: { legend: { display: false } },
                    scales: { x: { beginAtZero: true, grid: { color: document.documentElement.getAttribute('data-theme') === 'dark' ? '#334155' : '#f3f4f6' } } }
                }
            });
        }
    }

    // ---------- TOP OPERADORES ----------
    function renderizarTopOperadores() {
        const cont = $('listaTop');
        if (!cont) return;
        
        const po = {};
        estado.registros.forEach(r => {
            const n = r.nombre || 'SIN NOMBRE';
            if (!po[n]) po[n] = { nombre: n, horas: 0, galones: 0 };
            po[n].horas += num(r.horasTrab);
            po[n].galones += num(r.galones);
        });
        
        const lista = Object.values(po).sort((a, b) => b.horas - a.horas).slice(0, 5);
        const max = lista.length > 0 ? lista[0].horas : 1;
        
        cont.innerHTML = '';
        if (lista.length === 0) {
            cont.innerHTML = '<p style="padding:20px;text-align:center;color:var(--texto-claro);">Sin datos</p>';
            return;
        }
        
        const clases = ['oro', 'plata', 'bronce', 'normal', 'normal'];
        
        lista.forEach((op, i) => {
            const pct = ((op.horas / max) * 100).toFixed(0);
            const div = document.createElement('div');
            div.className = 'top-item';
            div.innerHTML = `
                <div class="top-puesto ${clases[i]}">${i + 1}</div>
                <div class="top-info">
                    <strong>${esc(op.nombre)}</strong>
                    <span>${fmt(op.galones, 1)} galones</span>
                </div>
                <div class="top-barra"><div class="top-barra-fill" style="width:${pct}%"></div></div>
                <div class="top-horas">${fmt(op.horas, 1)}h</div>`;
            cont.appendChild(div);
        });
    }

    // ---------- REGISTROS ----------
    function obtenerRegistrosFiltrados() {
        let regs = [...estado.registros].sort((a, b) => b.fechaCreacion - a.fechaCreacion);
        
        if (estado.busqueda) {
            const q = estado.busqueda.toLowerCase();
            regs = regs.filter(r =>
                (r.nombre || '').toLowerCase().includes(q) ||
                (r.region || '').toLowerCase().includes(q) ||
                (r.fecha || '').toLowerCase().includes(q)
            );
        }
        
        if (estado.filtroGasolina) {
            regs = regs.filter(r => r.combustible === estado.filtroGasolina);
        }
        
        return regs;
    }

    function renderizarRegistros() {
        const tb = $('cuerpoTabla');
        if (!tb) return;
        
        estado.busqueda = $('buscarRegistros')?.value?.toLowerCase().trim() || '';
        const regs = obtenerRegistrosFiltrados();
        
        const totalPag = Math.max(1, Math.ceil(regs.length / REGISTROS_POR_PAGINA));
        estado.paginaActual = Math.min(estado.paginaActual, totalPag);
        
        const inicio = (estado.paginaActual - 1) * REGISTROS_POR_PAGINA;
        const pagina = regs.slice(inicio, inicio + REGISTROS_POR_PAGINA);
        
        tb.innerHTML = '';
        
        if (pagina.length === 0) {
            tb.innerHTML = `<tr><td colspan="8" style="padding:50px;text-align:center;color:var(--texto-claro);">
                <i class="ri-inbox-line" style="font-size:32px;display:block;margin-bottom:10px;"></i>No se encontraron registros</td></tr>`;
        } else {
            pagina.forEach(r => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${esc(r.fecha)}</td>
                    <td><strong>${esc(r.nombre)}</strong></td>
                    <td><span class="region-tag">${esc(r.region)}</span></td>
                    <td class="numero" style="color:var(--azul);">${fmt(r.galones, 2)}</td>
                    <td class="numero">${fmt(r.horasTrab, 2)}</td>
                    <td><span class="etiqueta ${r.combustible === 'SI' ? 'si' : 'no'}">
                        ${r.combustible === 'SI' ? '⛽ Sí' : '❌ No'}
                    </span></td>
                    <td class="numero" style="color:var(--texto-claro);font-size:12.5px;">
                        ${fmt(r.horasInicio, 1)} → ${fmt(r.horasFin, 1)}
                    </td>
                    <td class="acciones-fila">
                        <button class="boton boton-chico boton-gris" onclick="verDetalleOperador('${esc(r.nombre)}')" title="Ver operador">
                            <i class="ri-user-line"></i>
                        </button>
                        <button class="boton boton-chico boton-rojo" onclick="eliminarRegistro('${r.id}')" title="Eliminar">
                            <i class="ri-delete-bin-line"></i>
                        </button>
                    </td>`;
                tb.appendChild(tr);
            });
        }
        
        renderizarPaginacion(totalPag);
    }

    function renderizarPaginacion(total) {
        const c = $('paginacion');
        if (!c) return;
        c.innerHTML = '';
        
        const btn = (texto, disabled, fn, activa = false) => {
            const b = document.createElement('button');
            b.className = 'pagina' + (activa ? ' activa' : '');
            b.innerHTML = texto;
            b.disabled = disabled;
            b.onclick = fn;
            c.appendChild(b);
        };
        
        btn('<', estado.paginaActual <= 1, () => { estado.paginaActual--; renderizarRegistros(); });
        
        const ini = Math.max(1, estado.paginaActual - 2);
        const fin = Math.min(total, ini + 4);
        for (let i = ini; i <= fin; i++) {
            btn(String(i), false, () => { estado.paginaActual = i; renderizarRegistros(); }, i === estado.paginaActual);
        }
        
        btn('>', estado.paginaActual >= total, () => { estado.paginaActual++; renderizarRegistros(); });
    }

    window.filtrarGasolina = function(valor, boton) {
        estado.filtroGasolina = valor;
        estado.paginaActual = 1;
        
        document.querySelectorAll('.chip-filtro').forEach(b => b.classList.remove('activo'));
        boton.classList.add('activo');
        
        renderizarRegistros();
    };

    // ---------- OPERADORES ----------
    function renderizarOperadores() {
        const grid = $('operadoresGrid');
        const vacio = $('operadoresVacios');
        if (!grid) return;
        
        const po = {};
        estado.registros.forEach(r => {
            const n = r.nombre || 'SIN NOMBRE';
            if (!po[n]) po[n] = { nombre: n, region: r.region || '-', registros: 0, galones: 0, horas: 0, conGas: 0, sinGas: 0 };
            po[n].registros++;
            po[n].galones += num(r.galones);
            po[n].horas += num(r.horasTrab);
            if (r.combustible === 'SI') po[n].conGas++;
            else po[n].sinGas++;
        });
        
        const lista = Object.values(po).sort((a, b) => b.horas - a.horas);
        
        if (lista.length === 0) {
            grid.innerHTML = '';
            vacio.style.display = 'flex';
            return;
        }
        
        vacio.style.display = 'none';
        grid.innerHTML = '';
        
        lista.forEach((op, i) => {
            const iniciales = op.nombre.split(' ').slice(0, 2).map(p => p[0]).join('');
            const puesto = ['🥇', '🥈', '🥉'][i] || (i + 1);
            
            const card = document.createElement('div');
            card.className = 'operador-tarjeta';
            card.onclick = () => verDetalleOperador(op.nombre);
            
            card.innerHTML = `
                <div class="operador-cabeza">
                    <div class="operador-puesto">${puesto}</div>
                    <div class="operador-avatar">${esc(iniciales)}</div>
                    <h3>${esc(op.nombre)}</h3>
                    <div class="operador-region"><i class="ri-map-pin-line"></i> ${esc(op.region)}</div>
                </div>
                <div class="operador-estadisticas">
                    <div class="op-est"><strong>${fmt(op.registros)}</strong><span>Registros</span></div>
                    <div class="op-est"><strong>${fmt(op.galones, 0)}</strong><span>Galones</span></div>
                    <div class="op-est"><strong>${fmt(op.horas, 0)}</strong><span>Horas</span></div>
                </div>
                <div class="operador-gasolina">
                    <div class="op-gas con">
                        <strong>${fmt(op.conGas)}</strong>
                        <span>⛽ Con gasolina</span>
                    </div>
                    <div class="op-gas sin">
                        <strong>${fmt(op.sinGas)}</strong>
                        <span>❌ Sin gasolina</span>
                    </div>
                </div>
                <div class="operador-ver">
                    Ver detalles <i class="ri-arrow-right-line"></i>
                </div>`;
            
            grid.appendChild(card);
        });
    }

    // ---------- DETALLE OPERADOR ----------
    window.verDetalleOperador = function(nombre) {
        const regsOp = estado.registros
            .filter(r => r.nombre === nombre)
            .sort((a, b) => b.fechaCreacion - a.fechaCreacion);
        
        if (regsOp.length === 0) {
            mostrarAviso('No hay registros de este operador', 'aviso');
            return;
        }
        
        const totalReg = regsOp.length;
        const totalGal = regsOp.reduce((s, r) => s + num(r.galones), 0);
        const totalHor = regsOp.reduce((s, r) => s + num(r.horasTrab), 0);
        const conGas = regsOp.filter(r => r.combustible === 'SI').length;
        const sinGas = totalReg - conGas;
        const pctGas = totalReg > 0 ? ((conGas / totalReg) * 100).toFixed(0) : 0;
        const region = regsOp[0].region || '-';
        const promGal = conGas > 0 ? (totalGal / conGas).toFixed(2) : '0';
        
        $('tituloOperador').innerHTML = `<i class="ri-user-line"></i> ${esc(nombre)}`;
        
        $('cuerpoOperador').innerHTML = `
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:24px;padding:16px;background:var(--fondo);border-radius:12px;">
                <div style="width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,var(--azul),var(--azul-claro));color:white;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;">
                    ${esc(nombre.split(' ').slice(0, 2).map(p => p[0]).join(''))}
                </div>
                <div>
                    <strong style="font-size:16px;">${esc(nombre)}</strong><br>
                    <span style="color:var(--texto-claro);font-size:13px;"><i class="ri-map-pin-line"></i> ${esc(region)} · ${pctGas}% de veces echaron gasolina</span>
                </div>
            </div>
            
            <div class="detalle-resumen">
                <div class="detalle-item"><strong>${fmt(totalReg)}</strong><span>Registros</span></div>
                <div class="detalle-item"><strong>${fmt(totalGal, 1)}</strong><span>Galones</span></div>
                <div class="detalle-item"><strong>${fmt(totalHor, 1)}</strong><span>Horas</span></div>
                <div class="detalle-item"><strong>${fmt(promGal)}</strong><span>Prom. Gal/Carga</span></div>
            </div>
            
            <div class="detalle-gas">
                <div class="detalle-gas-box con">
                    <i class="ri-gas-station-fill"></i>
                    <strong>${fmt(conGas)}</strong>
                    <span>Veces que SÍ echaron gasolina</span>
                </div>
                <div class="detalle-gas-box sin">
                    <i class="ri-gas-station-line"></i>
                    <strong>${fmt(sinGas)}</strong>
                    <span>Veces que NO echaron gasolina</span>
                </div>
            </div>
            
            <div class="detalle-registros-titulo">
                <i class="ri-list-check-2"></i> Últimos registros
            </div>
            
            <div class="detalle-lista">
                ${regsOp.slice(0, 30).map(r => `
                    <div class="detalle-registro">
                        <span class="fecha">${esc(r.fecha)}</span>
                        <span><span class="region-tag">${esc(r.region)}</span></span>
                        <span class="galones">${fmt(r.galones, 1)}</span>
                        <span class="horas">${fmt(r.horasTrab, 1)}h</span>
                        <span class="etiqueta ${r.combustible === 'SI' ? 'si' : 'no'}">${r.combustible === 'SI' ? '⛽ Sí' : '❌ No'}</span>
                    </div>
                `).join('')}
                ${regsOp.length > 30 ? `<div style="padding:12px;text-align:center;color:var(--texto-claro);font-size:12.5px;">... y ${fmt(regsOp.length - 30)} registros más</div>` : ''}
            </div>
        `;
        
        abrirModal('modalOperador');
    };

    // ---------- ARCHIVOS ----------
    function renderizarArchivos() {
        const lista = $('archivosLista');
        const vacio = $('archivosVacios');
        if (!lista) return;
        
        if (estado.archivos.length === 0) {
            lista.innerHTML = '';
            vacio.style.display = 'flex';
            return;
        }
        
        vacio.style.display = 'none';
        lista.innerHTML = '';
        
        [...estado.archivos].sort((a, b) => b.fecha - a.fecha).forEach(a => {
            const tam = a.tamano > 1048576 ? (a.tamano / 1048576).toFixed(2) + ' MB' :
                        a.tamano > 0 ? (a.tamano / 1024).toFixed(1) + ' KB' : 'Demo';
            const fecha = new Date(a.fecha).toLocaleString('es-GT');
            
            const div = document.createElement('div');
            div.className = 'archivo-item';
            div.innerHTML = `
                <div class="archivo-icono"><i class="ri-file-excel-2-line"></i></div>
                <div class="archivo-info">
                    <strong>${esc(a.nombre)}</strong>
                    <span>${tam} · ${fecha}</span>
                </div>
                <div class="archivo-badges">
                    <span class="archivo-badge">${fmt(a.registros)} registros</span>
                    <span class="archivo-badge">${esc(a.hoja)}</span>
                </div>
                <button class="boton boton-chico boton-rojo" onclick="eliminarArchivo('${a.id}')" title="Eliminar">
                    <i class="ri-delete-bin-line"></i>
                </button>`;
            lista.appendChild(div);
        });
    }

    window.eliminarArchivo = function(id) {
        confirmar('Eliminar Archivo', '¿Eliminar este archivo de la lista? (Los registros no se borran)', () => {
            estado.archivos = estado.archivos.filter(a => a.id !== id);
            guardarDatos();
            renderizarArchivos();
            mostrarAviso('Archivo eliminado de la lista', 'exito');
        });
    };

    // ---------- CRUD ----------
    window.agregarRegistro = function() {
        $('campoFecha').value = new Date().toLocaleDateString('es-GT');
        $('campoNombre').value = '';
        $('campoRegion').value = '';
        $('campoGasolina').value = 'SI';
        $('campoGalones').value = '';
        $('campoHoraInicio').value = '';
        $('campoHoraFin').value = '';
        $('campoHoras').value = '';
        abrirModal('modalAgregar');
        setTimeout(() => $('campoNombre').focus(), 100);
    };

    // Auto-calcular horas
    document.addEventListener('DOMContentLoaded', () => {
        const hi = $('campoHoraInicio');
        const hf = $('campoHoraFin');
        const calcular = () => {
            const a = num(hi?.value);
            const b = num(hf?.value);
            if (a && b) {
                const ht = b >= a ? b - a : (24 - a) + b;
                const campo = $('campoHoras');
                if (campo) campo.value = ht.toFixed(2);
            }
        };
        if (hi) hi.addEventListener('input', calcular);
        if (hf) hf.addEventListener('input', calcular);
    });

    window.guardarRegistro = function() {
        const nombre = $('campoNombre').value.trim().toUpperCase();
        if (!nombre) {
            mostrarAviso('Ingresa el nombre del operador', 'aviso');
            $('campoNombre').focus();
            return;
        }
        
        const hi = num($('campoHoraInicio').value);
        const hf = num($('campoHoraFin').value);
        let ht = num($('campoHoras').value);
        if (!ht && (hi || hf)) {
            ht = hf >= hi ? hf - hi : (24 - hi) + hf;
        }
        
        const gasolina = $('campoGasolina').value;
        const galones = gasolina === 'SI' ? num($('campoGalones').value) : 0;
        
        estado.registros.unshift({
            id: generarId(),
            fecha: $('campoFecha').value.trim() || new Date().toLocaleDateString('es-GT'),
            nombre,
            region: $('campoRegion').value.trim().toUpperCase() || 'SIN REGIÓN',
            horasInicio: hi,
            horasFin: hf,
            combustible: gasolina,
            galones,
            horasTrab: ht,
            fechaCreacion: Date.now()
        });
        
        cerrarModal('modalAgregar');
        guardarDatos();
        actualizarTodo();
        mostrarAviso('Registro agregado correctamente', 'exito');
    };

    window.eliminarRegistro = function(id) {
        confirmar('Eliminar Registro', '¿Estás seguro de eliminar este registro?', () => {
            estado.registros = estado.registros.filter(r => r.id !== id);
            guardarDatos();
            actualizarTodo();
            mostrarAviso('Registro eliminado', 'exito');
        });
    };

    // ---------- EXPORTAR ----------
    window.exportarExcel = function() {
        if (estado.registros.length === 0) {
            mostrarAviso('No hay datos para exportar', 'aviso');
            return;
        }
        
        const datos = [['FECHA', 'NOMBRE', 'REGIÓN', 'HORAS INICIO', 'HORAS FIN', 'GASOLINA', 'GALONES', 'HORAS TRABAJADAS']];
        estado.registros.forEach(r => {
            datos.push([r.fecha, r.nombre, r.region, r.horasInicio, r.horasFin, r.combustible, r.galones, r.horasTrab]);
        });
        
        const ws = XLSX.utils.aoa_to_sheet(datos);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Registros');
        XLSX.writeFile(wb, `EMA_Registros_${new Date().toISOString().split('T')[0]}.xlsx`);
        
        mostrarAviso('Excel descargado correctamente', 'exito');
    };

    window.limpiarTodo = function() {
        if (estado.registros.length === 0) {
            mostrarAviso('No hay datos para borrar', 'aviso');
            return;
        }
        
        confirmar('⚠️ Borrar TODO', '¿Estás SEGURO? Se eliminarán TODOS los registros y archivos. Esta acción no se puede deshacer.', () => {
            localStorage.removeItem(CLAVE_STORAGE);
            location.reload();
        });
    };

    // ---------- MODALES ----------
    function abrirModal(id) {
        $(id)?.classList.add('activo');
        document.body.style.overflow = 'hidden';
    }

    window.cerrarModal = function(id) {
        $(id)?.classList.remove('activo');
        if (!document.querySelector('.modal-fondo.activo')) {
            document.body.style.overflow = '';
        }
    };

    function confirmar(titulo, mensaje, callback) {
        $('mensajeConfirmar').textContent = mensaje;
        $('modalConfirmar').querySelector('h3').innerHTML = `<i class="ri-error-warning-line"></i> ${titulo}`;
        $('botonConfirmar').onclick = () => {
            cerrarModal('modalConfirmar');
            callback();
        };
        abrirModal('modalConfirmar');
    }

    function configurarEventos() {
        // Cerrar modales al hacer clic fuera
        document.querySelectorAll('.modal-fondo').forEach(m => {
            m.addEventListener('click', e => {
                if (e.target === m) {
                    m.classList.remove('activo');
                    if (!document.querySelector('.modal-fondo.activo')) {
                        document.body.style.overflow = '';
                    }
                }
            });
        });
        
        // Cerrar con Escape
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-fondo.activo').forEach(m => m.classList.remove('activo'));
                document.body.style.overflow = '';
            }
        });
    }

    // ---------- AVISOS ----------
    function mostrarAviso(mensaje, tipo = 'info') {
        const c = $('avisos');
        if (!c) return;
        
        const iconos = {
            exito: 'ri-checkbox-circle-fill',
            error: 'ri-error-warning-fill',
            aviso: 'ri-alert-line',
            info: 'ri-information-fill'
        };
        
        const div = document.createElement('div');
        div.className = `aviso ${tipo}`;
        div.innerHTML = `<i class="${iconos[tipo] || iconos.info}"></i><span>${esc(mensaje)}</span>`;
        c.appendChild(div);
        
        setTimeout(() => {
            div.style.opacity = '0';
            div.style.transform = 'translateX(40px)';
            div.style.transition = 'all 0.3s ease';
            setTimeout(() => div.remove(), 300);
        }, 3500);
    }

    // ---------- INICIAR ----------
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }

})();
