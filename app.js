/* ============================================
   EMA PRO - Control de Operadores y Gasolina
   JavaScript Poderoso con Asistente IA, Análisis,
   Reportes, Ajustes y características Premium
============================================ */

(function() {
    'use strict';

    // ---------- CONFIGURACIÓN ----------
    const CLAVE_STORAGE = 'ema_datos_pro_v2';
    const REGISTROS_POR_PAGINA = 15;
    const MAX_HISTORIAL = 30;

    // ---------- ESTADO GLOBAL ----------
    const state = {
        registros: [],
        archivos: [],
        vistaActiva: 'resumen',
        paginaActual: 1,
        filtroGasolina: null,
        filtroRegion: null,
        busqueda: '',
        busquedaGlobal: '',
        tema: 'light',
        ordenColumna: 'fechaCreacion',
        ordenDireccion: 'desc',
        graficos: {},
        historial: [],
        notificaciones: [],
        ajustes: {
            empresa: 'Tu Empresa',
            moneda: 'Q',
            precioGalon: 25.50,
            precioHora: 45.00
        },
        chatAbierto: false
    };

    // ---------- UTILIDADES ----------
    const $ = (id) => document.getElementById(id);
    const $$ = (sel) => document.querySelectorAll(sel);

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

    const fmt = (v, d = 0) => Number(v || 0).toLocaleString('es-GT', { 
        minimumFractionDigits: d, maximumFractionDigits: d 
    });

    const fmtMoneda = (v) => {
        const m = state.ajustes?.moneda || 'Q';
        return `${m} ${fmt(v, 2)}`;
    };

    const generarId = () => 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

    const fechaHoy = () => new Date().toLocaleDateString('es-GT');

    const horaActual = () => new Date().toLocaleTimeString('es-GT');

    // ---------- INICIO ----------
    function iniciar() {
        cargarDatosStorage();
        configurarCarga();
        configurarEventosGlobales();
        iniciarRelojVivo();
        iniciarAtajosTeclado();
        
        if (state.registros.length > 0) {
            ocultarPantallaInicio();
        }
        
        aplicarTema(state.tema);
        actualizarTodo();
        agregarNotificacion('Bienvenido a EMA PRO', 'Sistema listo para operar');
    }

    // ---------- ALMACENAMIENTO ----------
    function cargarDatosStorage() {
        try {
            const raw = localStorage.getItem(CLAVE_STORAGE);
            if (raw) {
                const d = JSON.parse(raw);
                state.registros = d.registros || [];
                state.archivos = d.archivos || [];
                state.tema = d.tema || 'light';
                state.ajustes = { ...state.ajustes, ...(d.ajustes || {}) };
                state.notificaciones = d.notificaciones || [];
            }
        } catch (e) { console.warn('Error cargando datos:', e); }
    }

    function guardarDatosStorage() {
        try {
            localStorage.setItem(CLAVE_STORAGE, JSON.stringify({
                registros: state.registros,
                archivos: state.archivos,
                tema: state.tema,
                ajustes: state.ajustes,
                notificaciones: state.notificaciones.slice(-20)
            }));
            return true;
        } catch (e) {
            mostrarAviso('No se pudo guardar los datos', 'error');
            return false;
        }
    }

    function guardarHistorial(accion, datos) {
        state.historial.unshift({ accion, datos, fecha: Date.now() });
        if (state.historial.length > MAX_HISTORIAL) state.historial.pop();
    }

    // ---------- PANTALLA INICIO ----------
    function ocultarPantallaInicio() {
        const inicio = $('pantallaInicio');
        if (inicio) {
            inicio.style.opacity = '0';
            inicio.style.transition = 'opacity 0.4s ease';
            setTimeout(() => {
                inicio.style.display = 'none';
                $('app').classList.add('activa');
            }, 400);
        } else {
            $('app').classList.add('activa');
        }
    }

    window.iniciarApp = function() {
        ocultarPantallaInicio();
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
                fechaCreacion: Date.now() - i * 1000
            });
        }
        
        state.registros = nuevos;
        state.archivos = [{
            id: generarId(),
            nombre: 'datos_demo.xlsx',
            tamano: 0,
            fecha: Date.now(),
            registros: 80,
            hoja: 'Demo'
        }];
        
        guardarDatosStorage();
        ocultarPantallaInicio();
        actualizarTodo();
        agregarNotificacion('Datos de ejemplo cargados', '80 registros importados correctamente');
        mostrarAviso('¡80 registros de ejemplo cargados!', 'exito');
    };

    // ---------- NAVEGACIÓN MEJORADA ----------
    window.cambiarVista = function(vista) {
        state.vistaActiva = vista;
        state.paginaActual = 1;
        
        $$('.vista').forEach(v => v.classList.remove('activa'));
        const vistaEl = $('vista-' + vista);
        if (vistaEl) vistaEl.classList.add('activa');
        
        $$('.menu-item').forEach(i => i.classList.remove('activo'));
        const menuEl = $('menu-' + vista);
        if (menuEl) menuEl.classList.add('activo');
        
        const migas = $('migasVista');
        const titulos = {
            resumen: 'Resumen',
            registros: 'Registros',
            operadores: 'Operadores',
            analisis: 'Análisis',
            reportes: 'Reportes',
            archivos: 'Archivos',
            ajustes: 'Ajustes'
        };
        if (migas) migas.textContent = titulos[vista] || vista;
        
        const tituloVista = $('tituloVista');
        if (tituloVista) tituloVista.textContent = titulos[vista] || vista;
        
        // Cerrar menú móvil
        $('menuLateral')?.classList.remove('abierto');
        
        // Renderizar según vista
        setTimeout(() => {
            if (vista === 'registros') renderizarRegistros();
            if (vista === 'operadores') renderizarOperadores();
            if (vista === 'archivos') renderizarArchivos();
            if (vista === 'analisis') renderizarAnalisis();
            if (vista === 'reportes') { $('panelReporte').style.display = 'none'; }
            if (vista === 'ajustes') cargarVistaAjustes();
        }, 60);
    };

    // ---------- MENÚ MÓVIL ----------
    window.toggleMenu = function() {
        $('menuLateral')?.classList.toggle('abierto');
    };

    // ---------- TEMA ----------
    window.cambiarTema = function() {
        state.tema = state.tema === 'light' ? 'dark' : 'light';
        aplicarTema(state.tema);
        guardarDatosStorage();
        setTimeout(renderizarGraficos, 120);
        mostrarAviso(`Modo ${state.tema === 'light' ? 'claro' : 'oscuro'} activado`, 'info');
    };

    function aplicarTema(tema) {
        document.documentElement.setAttribute('data-theme', tema);
        const icono = $('iconoTema');
        if (icono) icono.className = tema === 'light' ? 'ri-sun-line' : 'ri-moon-line';
    }

    // ---------- PANTALLA COMPLETA ----------
    window.togglePantallaCompleta = function() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
    };

    // ---------- RELOJ EN VIVO ----------
    function iniciarRelojVivo() {
        const actualizar = () => {
            const el = $('relojVivo');
            if (el) el.textContent = horaActual();
        };
        actualizar();
        setInterval(actualizar, 1000);
    }

    // ---------- ATAJOS DE TECLADO ----------
    function iniciarAtajosTeclado() {
        document.addEventListener('keydown', (e) => {
            const ctrl = e.ctrlKey || e.metaKey;
            
            if (ctrl && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                $('busquedaGlobal')?.focus();
            }
            if (ctrl && e.key.toLowerCase() === 'n') {
                e.preventDefault();
                agregarRegistro();
            }
            if (ctrl && e.key.toLowerCase() === 'e') {
                e.preventDefault();
                exportarExcel();
            }
            if (ctrl && e.key.toLowerCase() === 's') {
                e.preventDefault();
                guardarDatosStorage();
                mostrarAviso('Datos guardados', 'exito');
            }
            if (ctrl && e.key.toLowerCase() === 't') {
                e.preventDefault();
                cambiarTema();
            }
            if (ctrl && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                deshacer();
            }
            if (ctrl && e.key.toLowerCase() === 'm') {
                e.preventDefault();
                toggleChatbot();
            }
            if (e.key === '?') {
                mostrarAtajos();
            }
        });
    }

    window.mostrarAtajos = function() {
        abrirModal('modalAtajos');
    };

    // ---------- DESHACER ----------
    window.deshacer = function() {
        if (state.historial.length === 0) {
            mostrarAviso('No hay nada para deshacer', 'aviso');
            return;
        }
        mostrarAviso('Función de deshacer activada', 'info');
    };

    // ---------- CARGA ARCHIVOS ----------
    function configurarCarga() {
        const zonas = [ $('zonaCarga'), $('zonaCargaArchivos') ];
        const input = $('cargarArchivo');
        
        zonas.forEach(zona => {
            if (!zona) return;
            zona.addEventListener('click', () => input?.click());
            zona.addEventListener('dragover', e => { 
                e.preventDefault(); 
                zona.classList.add('activa'); 
            });
            zona.addEventListener('dragleave', () => zona.classList.remove('activa'));
            zona.addEventListener('drop', e => {
                e.preventDefault();
                zona.classList.remove('activa');
                procesarArchivos(e.dataTransfer.files);
            });
        });
        
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
                
                guardarHistorial('importar', { cantidad: nuevos.length });
                
                state.registros = state.registros.concat(nuevos);
                state.archivos.push({
                    id: generarId(),
                    nombre: file.name,
                    tamano: file.size,
                    fecha: Date.now(),
                    registros: nuevos.length,
                    hoja: wb.SheetNames[0]
                });
                
                guardarDatosStorage();
                actualizarTodo();
                agregarNotificacion('Archivo importado', `${file.name}: ${nuevos.length} registros`);
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
                fecha: row[0] ? String(row[0]) : fechaHoy(),
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
        const hay = state.registros.length > 0;
        
        if ($('zonaCarga')) $('zonaCarga').style.display = hay ? 'none' : 'block';
        if ($('contenidoResumen')) $('contenidoResumen').style.display = hay ? 'block' : 'none';
        if ($('mensajeVacio')) $('mensajeVacio').style.display = hay ? 'none' : 'flex';
        
        // Actualizar contadores en menú
        const contReg = $('contadorRegistros');
        if (contReg) contReg.textContent = fmt(state.registros.length);
        
        if (hay) {
            actualizarResumen();
            renderizarGraficos();
            renderizarTopOperadores();
            renderizarActividadReciente();
            generarSparklines();
            actualizarPorcentajesGasolina();
        }
        
        renderizarRegistros();
        renderizarOperadores();
        renderizarArchivos();
        renderizarFiltroRegiones();
        actualizarCampana();
    }

    // ---------- RESUMEN ----------
    function actualizarResumen() {
        const r = state.registros;
        
        $('totalRegistros').textContent = fmt(r.length);
        $('totalGalones').textContent = fmt(r.reduce((s, x) => s + num(x.galones), 0), 1);
        $('totalHoras').textContent = fmt(r.reduce((s, x) => s + num(x.horasTrab), 0), 1);
        
        const operadores = new Set(r.map(x => x.nombre).filter(Boolean));
        $('totalOperadores').textContent = fmt(operadores.size);
        
        const conGas = r.filter(x => x.combustible === 'SI').length;
        $('conGasolina').textContent = fmt(conGas);
        $('sinGasolina').textContent = fmt(r.length - conGas);
    }

    function actualizarPorcentajesGasolina() {
        const total = state.registros.length;
        if (total === 0) return;
        
        const con = state.registros.filter(r => r.combustible === 'SI').length;
        const pctCon = (con / total * 100).toFixed(0);
        const pctSin = 100 - pctCon;
        
        const elCon = $('pctConGasolina');
        const elSin = $('pctSinGasolina');
        if (elCon) setTimeout(() => elCon.style.width = pctCon + '%', 100);
        if (elSin) setTimeout(() => elSin.style.width = pctSin + '%', 100);
    }

    // ---------- SPARKLINES (mini gráficos) ----------
    function generarSparklines() {
        const categorias = ['Registros', 'Galones', 'Horas', 'Operadores'];
        const ids = ['sparkRegistros', 'sparkGalones', 'sparkHoras', 'sparkOperadores'];
        
        ids.forEach((id, i) => {
            const el = $(id);
            if (!el) return;
            
            const puntos = Array.from({length: 10}, () => Math.random() * 0.7 + 0.3);
            const w = 60, h = 36;
            const max = Math.max(...puntos);
            const pts = puntos.map((p, idx) => {
                const x = (idx / (puntos.length - 1)) * w;
                const y = h - (p / max) * (h - 6) - 3;
                return `${x},${y}`;
            }).join(' ');
            
            const colores = ['#2563eb', '#16a34a', '#ea580c', '#9333ea'];
            
            el.innerHTML = `
                <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
                    <defs>
                        <linearGradient id="grad${i}" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="${colores[i]}" stop-opacity="0.4"/>
                            <stop offset="100%" stop-color="${colores[i]}" stop-opacity="0"/>
                        </linearGradient>
                    </defs>
                    <polygon points="0,${h} ${pts} ${w},${h}" fill="url(#grad${i})"/>
                    <polyline points="${pts}" fill="none" stroke="${colores[i]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>`;
        });
    }

    // ---------- GRÁFICOS ----------
    function renderizarGraficos() {
        if (state.registros.length === 0) return;
        
        const pr = {};
        state.registros.forEach(r => {
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
        const bgT = labels.map((_, i) => colores[i % colores.length] + '44');
        
        const esOscuro = document.documentElement.getAttribute('data-theme') === 'dark';
        const colorGrid = esOscuro ? '#334155' : '#f3f4f6';
        
        Object.values(state.graficos).forEach(g => g?.destroy?.());
        state.graficos = {};
        
        const optsComunes = {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            animation: { duration: 800, easing: 'easeOutQuart' }
        };
        
        if ($('graficoGalones')) {
            state.graficos.galones = new Chart($('graficoGalones'), {
                type: 'bar',
                data: { labels, datasets: [{ 
                    label: 'Galones', data: galData, 
                    backgroundColor: bg, borderRadius: 10,
                    borderSkipped: false
                }] },
                options: {
                    ...optsComunes,
                    scales: { 
                        y: { beginAtZero: true, grid: { color: colorGrid }, ticks: { font: { size: 11 } } },
                        x: { grid: { display: false }, ticks: { font: { size: 11 } } }
                    }
                }
            });
        }
        
        if ($('graficoGasolina')) {
            const con = state.registros.filter(r => r.combustible === 'SI').length;
            const sin = state.registros.length - con;
            
            state.graficos.gasolina = new Chart($('graficoGasolina'), {
                type: 'doughnut',
                data: {
                    labels: ['Con Gasolina', 'Sin Gasolina'],
                    datasets: [{ 
                        data: [con, sin], 
                        backgroundColor: ['#16a34a', '#9ca3af'], 
                        borderColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#1e293b' : '#ffffff', 
                        borderWidth: 4, hoverOffset: 14 
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '68%',
                    animation: { animateRotate: true, animateScale: true, duration: 1000 },
                    plugins: { 
                        legend: { 
                            position: 'bottom', 
                            labels: { 
                                padding: 24, font: { size: 13, weight: '600' },
                                usePointStyle: true, pointStyle: 'circle'
                            } 
                        } 
                    }
                }
            });
        }
        
        if ($('graficoHoras')) {
            state.graficos.horas = new Chart($('graficoHoras'), {
                type: 'bar',
                data: { labels, datasets: [{ 
                    label: 'Horas', data: horData, 
                    backgroundColor: bgT, borderColor: bg, 
                    borderWidth: 2.5, borderRadius: 10
                }] },
                options: {
                    ...optsComunes,
                    indexAxis: 'y',
                    scales: { 
                        x: { beginAtZero: true, grid: { color: colorGrid }, ticks: { font: { size: 11 } } },
                        y: { grid: { display: false }, ticks: { font: { size: 11 } } }
                    }
                }
            });
        }
    }

    // ---------- TOP OPERADORES ----------
    function renderizarTopOperadores() {
        const cont = $('listaTop');
        if (!cont) return;
        
        const po = {};
        state.registros.forEach(r => {
            const n = r.nombre || 'SIN NOMBRE';
            if (!po[n]) po[n] = { nombre: n, horas: 0, galones: 0 };
            po[n].horas += num(r.horasTrab);
            po[n].galones += num(r.galones);
        });
        
        const lista = Object.values(po).sort((a, b) => b.horas - a.horas).slice(0, 5);
        const max = lista.length > 0 ? lista[0].horas : 1;
        
        cont.innerHTML = '';
        if (lista.length === 0) {
            cont.innerHTML = '<p style="padding:24px;text-align:center;color:var(--texto-claro);">Sin datos aún</p>';
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
                <div class="top-barra"><div class="top-barra-fill" style="width:0%"></div></div>
                <div class="top-horas">${fmt(op.horas, 1)}h</div>`;
            cont.appendChild(div);
            
            setTimeout(() => {
                div.querySelector('.top-barra-fill').style.width = pct + '%';
            }, 100 + i * 80);
        });
    }

    // ---------- ACTIVIDAD RECIENTE ----------
    function renderizarActividadReciente() {
        const cont = $('actividadReciente');
        if (!cont) return;
        
        const recientes = [...state.registros]
            .sort((a, b) => b.fechaCreacion - a.fechaCreacion)
            .slice(0, 6);
        
        cont.innerHTML = '';
        
        if (recientes.length === 0) {
            cont.innerHTML = '<p style="padding:24px;text-align:center;color:var(--texto-claro);">Sin actividad</p>';
            return;
        }
        
        recientes.forEach(r => {
            const div = document.createElement('div');
            div.className = 'actividad-item';
            const hace = tiempoAtras(r.fechaCreacion);
            div.innerHTML = `
                <div class="actividad-punto" style="background:${r.combustible === 'SI' ? 'var(--verde)' : 'var(--gris)'}"></div>
                <div class="actividad-info">
                    <strong>${esc(r.nombre)}</strong>
                    <span>${esc(r.region)} · ${fmt(r.horasTrab, 1)}h · ${fmt(r.galones, 0)}gal</span>
                </div>
                <span class="actividad-fecha">${hace}</span>`;
            cont.appendChild(div);
        });
    }

    function tiempoAtras(ts) {
        const diff = Date.now() - ts;
        const min = Math.floor(diff / 60000);
        if (min < 1) return 'Ahora';
        if (min < 60) return `Hace ${min}m`;
        const h = Math.floor(min / 60);
        if (h < 24) return `Hace ${h}h`;
        return `Hace ${Math.floor(h / 24)}d`;
    }

    // ---------- REGISTROS ----------
    function obtenerRegistrosFiltrados() {
        let regs = [...state.registros];
        
        // Ordenamiento
        const col = state.ordenColumna;
        const dir = state.ordenDireccion === 'asc' ? 1 : -1;
        regs.sort((a, b) => {
            let va = a[col], vb = b[col];
            if (typeof va === 'string') va = va.toLowerCase();
            if (typeof vb === 'string') vb = vb.toLowerCase();
            if (va < vb) return -1 * dir;
            if (va > vb) return 1 * dir;
            return 0;
        });
        
        // Búsqueda
        if (state.busqueda) {
            const q = state.busqueda.toLowerCase();
            regs = regs.filter(r =>
                (r.nombre || '').toLowerCase().includes(q) ||
                (r.region || '').toLowerCase().includes(q) ||
                (r.fecha || '').toLowerCase().includes(q)
            );
        }
        
        // Filtros
        if (state.filtroGasolina) {
            regs = regs.filter(r => r.combustible === state.filtroGasolina);
        }
        
        if (state.filtroRegion) {
            regs = regs.filter(r => r.region === state.filtroRegion);
        }
        
        return regs;
    }

    function renderizarRegistros() {
        const tb = $('cuerpoTabla');
        if (!tb) return;
        
        state.busqueda = $('buscarRegistros')?.value?.toLowerCase().trim() || '';
        const regs = obtenerRegistrosFiltrados();
        
        const info = $('resultadosInfo');
        if (info) info.textContent = `${fmt(regs.length)} registro${regs.length !== 1 ? 's' : ''}`;
        
        const totalPag = Math.max(1, Math.ceil(regs.length / REGISTROS_POR_PAGINA));
        state.paginaActual = Math.min(state.paginaActual, totalPag);
        
        const inicio = (state.paginaActual - 1) * REGISTROS_POR_PAGINA;
        const pagina = regs.slice(inicio, inicio + REGISTROS_POR_PAGINA);
        
        tb.innerHTML = '';
        
        if (pagina.length === 0) {
            tb.innerHTML = `<tr><td colspan="8" style="padding:60px 20px;text-align:center;color:var(--texto-claro);">
                <i class="ri-inbox-line" style="font-size:36px;display:block;margin-bottom:12px;"></i>
                <strong style="color:var(--texto-suave);">No se encontraron registros</strong><br>
                <span style="font-size:13px;">Intenta con otros filtros de búsqueda</span>
                </td></tr>`;
        } else {
            pagina.forEach((r, idx) => {
                const tr = document.createElement('tr');
                tr.style.animation = `aparecer 0.3s ease ${idx * 0.02}s both`;
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
        state.filtroGasolina = valor;
        state.paginaActual = 1;
        
        $$('.chip-filtro').forEach(b => b.classList.remove('activo'));
        if (boton) boton.classList.add('activo');
        
        renderizarRegistros();
    };

    window.filtrarRegion = function(region, boton) {
        state.filtroRegion = state.filtroRegion === region ? null : region;
        state.paginaActual = 1;
        
        $$('.chip-region').forEach(b => b.classList.remove('activo'));
        if (boton && state.filtroRegion) boton.classList.add('activo');
        
        renderizarRegistros();
    };

    window.refrescarRegistros = function() {
        state.busqueda = '';
        state.filtroGasolina = null;
        state.filtroRegion = null;
        state.paginaActual = 1;
        if ($('buscarRegistros')) $('buscarRegistros').value = '';
        $$('.chip-filtro').forEach((b, i) => b.classList.toggle('activo', i === 0));
        $$('.chip-region').forEach(b => b.classList.remove('activo'));
        renderizarRegistros();
        mostrarAviso('Filtros restablecidos', 'info');
    };

    window.ordenarPor = function(col) {
        if (state.ordenColumna === col) {
            state.ordenDireccion = state.ordenDireccion === 'asc' ? 'desc' : 'asc';
        } else {
            state.ordenColumna = col;
            state.ordenDireccion = 'desc';
        }
        renderizarRegistros();
    };

    function renderizarFiltroRegiones() {
        const cont = $('filtroRegion');
        if (!cont) return;
        
        const regiones = [...new Set(state.registros.map(r => r.region).filter(Boolean))].sort();
        
        if (regiones.length === 0) {
            cont.innerHTML = '';
            return;
        }
        
        cont.innerHTML = regiones.map(reg => `
            <button class="chip-filtro chip-region ${state.filtroRegion === reg ? 'activo' : ''}" 
                    onclick="filtrarRegion('${esc(reg)}', this)">
                ${esc(reg)}
            </button>
        `).join('');
    }

    // ---------- BÚSQUEDA GLOBAL ----------
    window.busquedaGlobal = function(texto) {
        state.busquedaGlobal = texto.toLowerCase().trim();
        if (!state.busquedaGlobal) return;
        
        const resultados = state.registros.filter(r =>
            (r.nombre || '').toLowerCase().includes(state.busquedaGlobal) ||
            (r.region || '').toLowerCase().includes(state.busquedaGlobal)
        ).slice(0, 5);
        
        if (resultados.length > 0) {
            cambiarVista('registros');
            setTimeout(() => {
                if ($('buscarRegistros')) $('buscarRegistros').value = texto;
                state.busqueda = state.busquedaGlobal;
                renderizarRegistros();
            }, 100);
        }
    };

    // ---------- OPERADORES ----------
    function renderizarOperadores() {
        const grid = $('operadoresGrid');
        const vacio = $('operadoresVacios');
        if (!grid) return;
        
        const po = {};
        state.registros.forEach(r => {
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
            if (vacio) vacio.style.display = 'flex';
            return;
        }
        
        if (vacio) vacio.style.display = 'none';
        grid.innerHTML = '';
        
        lista.forEach((op, i) => {
            const iniciales = op.nombre.split(' ').slice(0, 2).map(p => p[0]).join('');
            const puesto = ['🥇', '🥈', '🥉'][i] || (i + 1);
            
            const card = document.createElement('div');
            card.className = 'operador-tarjeta';
            card.style.animation = `aparecer 0.4s ease ${Math.min(i * 0.05, 0.4)}s both`;
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
                    Ver detalles completos <i class="ri-arrow-right-line"></i>
                </div>`;
            
            grid.appendChild(card);
        });
    }

    // ---------- DETALLE OPERADOR ----------
    window.verDetalleOperador = function(nombre) {
        const regsOp = state.registros
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
        const costoGas = totalGal * (state.ajustes.precioGalon || 0);
        const costoHoras = totalHor * (state.ajustes.precioHora || 0);
        
        const titulo = $('tituloOperador');
        if (titulo) titulo.innerHTML = `<i class="ri-user-line"></i> ${esc(nombre)}`;
        
        const cuerpo = $('cuerpoOperador');
        if (cuerpo) {
            cuerpo.innerHTML = `
                <div style="display:flex;align-items:center;gap:16px;margin-bottom:26px;padding:20px;background:var(--fondo);border-radius:16px;border:1px solid var(--borde);">
                    <div style="width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,var(--azul),var(--azul-claro));color:white;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:900;box-shadow:0 6px 18px rgba(37,99,235,0.3);">
                        ${esc(nombre.split(' ').slice(0, 2).map(p => p[0]).join(''))}
                    </div>
                    <div style="flex:1;">
                        <strong style="font-size:18px;">${esc(nombre)}</strong><br>
                        <span style="color:var(--texto-claro);font-size:13px;"><i class="ri-map-pin-line"></i> ${esc(region)} · ${pctGas}% de veces echaron gasolina</span>
                    </div>
                </div>
                
                <div class="detalle-resumen">
                    <div class="detalle-item"><strong>${fmt(totalReg)}</strong><span>Registros</span></div>
                    <div class="detalle-item"><strong>${fmt(totalGal, 1)}</strong><span>Galones</span></div>
                    <div class="detalle-item"><strong>${fmt(totalHor, 1)}</strong><span>Horas</span></div>
                    <div class="detalle-item"><strong>${fmt(promGal)}</strong><span>Prom. Gal</span></div>
                </div>
                
                <div class="detalle-gas">
                    <div class="detalle-gas-box con">
                        <i class="ri-gas-station-fill"></i>
                        <strong>${fmt(conGas)}</strong>
                        <span>Veces que SÍ echaron gasolina</span>
                        <div style="margin-top:8px;font-size:12px;color:var(--texto-claro);">${fmtMoneda(costoGas)}</div>
                    </div>
                    <div class="detalle-gas-box sin">
                        <i class="ri-gas-station-line"></i>
                        <strong>${fmt(sinGas)}</strong>
                        <span>Veces que NO echaron gasolina</span>
                        <div style="margin-top:8px;font-size:12px;color:var(--texto-claro);">${fmtMoneda(costoHoras)}</div>
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
                    ${regsOp.length > 30 ? `<div style="padding:14px;text-align:center;color:var(--texto-claro);font-size:12.5px;background:var(--fondo);">... y ${fmt(regsOp.length - 30)} registros más</div>` : ''}
                </div>
            `;
        }
        
        abrirModal('modalOperador');
    };

    // ---------- ARCHIVOS (NUEVO DISEÑO GRID) ----------
    function renderizarArchivos() {
        const grid = $('archivosGrid');
        const lista = $('archivosLista');
        const vacio = $('archivosVacios');
        
        const contenedor = grid || lista;
        if (!contenedor) return;
        
        if (state.archivos.length === 0) {
            contenedor.innerHTML = '';
            if (vacio) vacio.style.display = 'flex';
            return;
        }
        
        if (vacio) vacio.style.display = 'none';
        
        if (grid) {
            grid.innerHTML = '';
            [...state.archivos].sort((a, b) => b.fecha - a.fecha).forEach((a, i) => {
                const tam = a.tamano > 1048576 ? (a.tamano / 1048576).toFixed(2) + ' MB' :
                            a.tamano > 0 ? (a.tamano / 1024).toFixed(1) + ' KB' : 'Demo';
                const fecha = new Date(a.fecha).toLocaleString('es-GT');
                
                const div = document.createElement('div');
                div.className = 'archivo-item';
                div.style.animation = `aparecer 0.35s ease ${Math.min(i * 0.05, 0.3)}s both`;
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
                grid.appendChild(div);
            });
        } else {
            lista.innerHTML = '';
            [...state.archivos].sort((a, b) => b.fecha - a.fecha).forEach(a => {
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
    }

    window.eliminarArchivo = function(id) {
        confirmar('Eliminar Archivo', '¿Eliminar este archivo de la lista? (Los registros no se borran)', () => {
            state.archivos = state.archivos.filter(a => a.id !== id);
            guardarDatosStorage();
            renderizarArchivos();
            mostrarAviso('Archivo eliminado de la lista', 'exito');
        });
    };

    // ---------- VISTA ANÁLISIS (NUEVA) ----------
    function renderizarAnalisis() {
        if (state.registros.length === 0) {
            ['mejorOperador', 'estadisticasGasolina', 'metricasClave'].forEach(id => {
                const el = $(id);
                if (el) el.innerHTML = '<p class="analisis-vacio">Carga datos para ver el análisis</p>';
            });
            const mapa = $('mapaCalor');
            if (mapa) mapa.innerHTML = '<p style="padding:40px;text-align:center;color:var(--texto-claro);">Sin datos para el mapa de calor</p>';
            return;
        }
        
        // Mejor operador
        const po = {};
        state.registros.forEach(r => {
            const n = r.nombre;
            if (!po[n]) po[n] = { nombre: n, horas: 0, galones: 0, registros: 0 };
            po[n].horas += num(r.horasTrab);
            po[n].galones += num(r.galones);
            po[n].registros++;
        });
        
        const mejor = Object.values(po).sort((a, b) => b.horas - a.horas)[0];
        const elMejor = $('mejorOperador');
        if (elMejor && mejor) {
            elMejor.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--fondo);border-radius:12px;">
                    <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:white;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;">
                        ${esc(mejor.nombre.split(' ').slice(0, 2).map(p => p[0]).join(''))}
                    </div>
                    <div style="flex:1;">
                        <strong style="font-size:15px;">${esc(mejor.nombre)}</strong><br>
                        <span style="font-size:12px;color:var(--texto-claro);">${fmt(mejor.horas, 1)}h · ${fmt(mejor.galones, 0)}gal</span>
                    </div>
                    <span style="font-size:24px;">🏆</span>
                </div>`;
        }
        
        // Estadísticas gasolina
        const total = state.registros.length;
        const con = state.registros.filter(r => r.combustible === 'SI').length;
        const sin = total - con;
        const totalGal = state.registros.reduce((s, r) => s + num(r.galones), 0);
        const promGal = con > 0 ? totalGal / con : 0;
        const pctCon = total > 0 ? (con / total * 100).toFixed(1) : 0;
        
        const elGas = $('estadisticasGasolina');
        if (elGas) {
            elGas.innerHTML = `
                <div class="analisis-fila"><span>Total registros</span><span>${fmt(total)}</span></div>
                <div class="analisis-fila"><span>Con gasolina</span><span style="color:var(--verde);">${fmt(con)} (${pctCon}%)</span></div>
                <div class="analisis-fila"><span>Sin gasolina</span><span style="color:var(--gris);">${fmt(sin)}</span></div>
                <div class="analisis-fila"><span>Galones totales</span><span>${fmt(totalGal, 1)}</span></div>
                <div class="analisis-fila"><span>Promedio por carga</span><span>${fmt(promGal, 2)}</span></div>`;
        }
        
        // Métricas clave
        const totalHoras = state.registros.reduce((s, r) => s + num(r.horasTrab), 0);
        const numOperadores = Object.keys(po).length;
        const promHorasOp = numOperadores > 0 ? totalHoras / numOperadores : 0;
        const costoGas = totalGal * (state.ajustes.precioGalon || 0);
        const costoHoras = totalHoras * (state.ajustes.precioHora || 0);
        
        const elMet = $('metricasClave');
        if (elMet) {
            elMet.innerHTML = `
                <div class="analisis-fila"><span>Operadores activos</span><span>${fmt(numOperadores)}</span></div>
                <div class="analisis-fila"><span>Prom. horas/op</span><span>${fmt(promHorasOp, 1)}h</span></div>
                <div class="analisis-fila"><span>Costo combustible</span><span>${fmtMoneda(costoGas)}</span></div>
                <div class="analisis-fila"><span>Costo mano obra</span><span>${fmtMoneda(costoHoras)}</span></div>
                <div class="analisis-fila"><span>Costo total estim.</span><span style="color:var(--azul);font-weight:800;">${fmtMoneda(costoGas + costoHoras)}</span></div>`;
        }
        
        // Gráfico tendencia
        renderizarGraficoTendencia();
        
        // Mapa de calor
        renderizarMapaCalor();
    }

    function renderizarGraficoTendencia() {
        const canvas = $('graficoTendencia');
        if (!canvas) return;
        
        if (state.graficos.tendencia) state.graficos.tendencia.destroy();
        
        const pr = {};
        state.registros.forEach(r => {
            const reg = r.region || 'SIN REGIÓN';
            if (!pr[reg]) pr[reg] = 0;
            pr[reg] += num(r.horasTrab);
        });
        
        const labels = Object.keys(pr);
        const data = labels.map(l => pr[l]);
        const colores = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#dc2626'];
        const bg = labels.map((_, i) => colores[i % colores.length] + '44');
        const bd = labels.map((_, i) => colores[i % colores.length]);
        
        state.graficos.tendencia = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Horas',
                    data,
                    fill: true,
                    tension: 0.4,
                    backgroundColor: bg[0] || 'rgba(37,99,235,0.2)',
                    borderColor: bd[0] || '#2563eb',
                    borderWidth: 3,
                    pointBackgroundColor: bd[0] || '#2563eb',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                animation: { duration: 1000, easing: 'easeOutQuart' },
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: document.documentElement.getAttribute('data-theme') === 'dark' ? '#334155' : '#f3f4f6' } }
                }
            }
        });
    }

    function renderizarMapaCalor() {
        const cont = $('mapaCalor');
        if (!cont) return;
        
        const regiones = [...new Set(state.registros.map(r => r.region).filter(Boolean))].sort();
        if (regiones.length === 0) {
            cont.innerHTML = '<p style="padding:40px;text-align:center;color:var(--texto-claro);">Sin datos</p>';
            return;
        }
        
        const fechas = [...new Set(state.registros.map(r => r.fecha))].slice(-8);
        
        let max = 0;
        const datos = {};
        regiones.forEach(reg => {
            datos[reg] = {};
            fechas.forEach(f => {
                const c = state.registros.filter(r => r.region === reg && r.fecha === f).length;
                datos[reg][f] = c;
                if (c > max) max = c;
            });
        });
        
        const color = (v) => {
            if (max === 0) return 'rgba(37,99,235,0.08)';
            const int = v / max;
            return `rgba(37, 99, 235, ${0.1 + int * 0.8})`;
        };
        
        let html = '<div class="mapa-calor">';
        
        // Encabezado fechas
        html += '<div class="mapa-calor-fila">';
        html += '<div class="mapa-calor-etiqueta"></div>';
        fechas.forEach(f => {
            html += `<div class="mapa-calor-etiqueta" style="text-align:center;font-size:10.5px;">${esc(f.split('/').slice(0, 2).join('/'))}</div>`;
        });
        html += '</div>';
        
        regiones.forEach(reg => {
            html += '<div class="mapa-calor-fila">';
            html += `<div class="mapa-calor-etiqueta">${esc(reg)}</div>`;
            fechas.forEach(f => {
                const v = datos[reg][f] || 0;
                html += `<div class="mapa-calor-celda" style="background:${color(v)};" title="${esc(reg)} · ${esc(f)}: ${v} registros"></div>`;
            });
            html += '</div>';
        });
        
        html += '</div>';
        
        // Leyenda
        html += '<div style="display:flex;align-items:center;gap:8px;margin-top:16px;justify-content:flex-end;font-size:12px;color:var(--texto-claro);">';
        html += '<span>Menos</span>';
        [0.1, 0.3, 0.5, 0.7, 0.9].forEach(i => {
            html += `<div style="width:20px;height:20px;border-radius:4px;background:rgba(37,99,235,${i});"></div>`;
        });
        html += '<span>Más</span></div>';
        
        cont.innerHTML = html;
    }

    // ---------- VISTA REPORTES (NUEVA) ----------
    window.generarReporte = function(tipo) {
        const panel = $('panelReporte');
        const titulo = $('tituloReporte');
        const contenido = $('contenidoReporte');
        
        if (!panel || !titulo || !contenido) return;
        
        panel.style.display = 'block';
        
        if (tipo === 'excel') {
            exportarExcel();
            panel.style.display = 'none';
            return;
        }
        
        if (state.registros.length === 0) {
            contenido.innerHTML = '<p style="padding:40px;text-align:center;color:var(--texto-claro);">Carga datos para generar reportes</p>';
            return;
        }
        
        const total = state.registros.length;
        const totalGal = state.registros.reduce((s, r) => s + num(r.galones), 0);
        const totalHor = state.registros.reduce((s, r) => s + num(r.horasTrab), 0);
        const con = state.registros.filter(r => r.combustible === 'SI').length;
        const sin = total - con;
        
        if (tipo === 'resumen') {
            titulo.innerHTML = '<i class="ri-file-text-line"></i> Reporte Resumen General';
            contenido.innerHTML = `
                <div class="detalle-resumen">
                    <div class="detalle-item"><strong>${fmt(total)}</strong><span>Registros</span></div>
                    <div class="detalle-item"><strong>${fmt(totalGal, 1)}</strong><span>Galones</span></div>
                    <div class="detalle-item"><strong>${fmt(totalHor, 1)}</strong><span>Horas</span></div>
                    <div class="detalle-item"><strong>${fmt(Object.keys([...new Set(state.registros.map(r => r.nombre))]).length)}</strong><span>Operadores</span></div>
                </div>
                <div class="detalle-gas">
                    <div class="detalle-gas-box con"><i class="ri-gas-station-fill"></i><strong>${fmt(con)}</strong><span>Con gasolina</span></div>
                    <div class="detalle-gas-box sin"><i class="ri-gas-station-line"></i><strong>${fmt(sin)}</strong><span>Sin gasolina</span></div>
                </div>
                <div style="padding:16px;background:var(--fondo);border-radius:12px;text-align:center;">
                    <strong>Fecha de generación:</strong> ${fechaHoy()} ${horaActual()}
                </div>`;
        }
        
        if (tipo === 'operadores') {
            titulo.innerHTML = '<i class="ri-team-line"></i> Reporte de Operadores';
            const po = {};
            state.registros.forEach(r => {
                const n = r.nombre;
                if (!po[n]) po[n] = { nombre: n, region: r.region, registros: 0, galones: 0, horas: 0 };
                po[n].registros++;
                po[n].galones += num(r.galones);
                po[n].horas += num(r.horasTrab);
            });
            const lista = Object.values(po).sort((a, b) => b.horas - a.horas);
            
            contenido.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:8px;">
                    ${lista.map((op, i) => `
                        <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--fondo);border-radius:10px;">
                            <strong style="width:30px;color:var(--azul);">#${i + 1}</strong>
                            <div style="flex:1;">
                                <strong>${esc(op.nombre)}</strong><br>
                                <span style="font-size:12px;color:var(--texto-claro);">${esc(op.region)}</span>
                            </div>
                            <div style="text-align:right;font-family:'JetBrains Mono',monospace;">
                                <div style="font-weight:700;">${fmt(op.horas, 1)}h</div>
                                <div style="font-size:11px;color:var(--texto-claro);">${fmt(op.galones, 0)}gal</div>
                            </div>
                        </div>
                    `).join('')}
                </div>`;
        }
        
        if (tipo === 'gasolina') {
            titulo.innerHTML = '<i class="ri-drop-line"></i> Reporte de Gasolina';
            const pr = {};
            state.registros.forEach(r => {
                const reg = r.region;
                if (!pr[reg]) pr[reg] = { galones: 0, cargas: 0, sinCarga: 0 };
                pr[reg].galones += num(r.galones);
                if (r.combustible === 'SI') pr[reg].cargas++;
                else pr[reg].sinCarga++;
            });
            
            contenido.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:10px;">
                    ${Object.entries(pr).sort((a, b) => b[1].galones - a[1].galones).map(([reg, d]) => `
                        <div style="padding:16px;background:var(--fondo);border-radius:12px;border-left:4px solid var(--azul);">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                                <strong style="font-size:16px;">${esc(reg)}</strong>
                                <span style="font-family:'JetBrains Mono',monospace;font-weight:800;color:var(--azul);">${fmt(d.galones, 1)} gal</span>
                            </div>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px;">
                                <div style="color:var(--verde);">⛽ ${fmt(d.cargas)} cargas</div>
                                <div style="color:var(--gris);">❌ ${fmt(d.sinCarga)} sin carga</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div style="margin-top:20px;padding:16px;background:linear-gradient(135deg,rgba(37,99,235,0.08),rgba(217,119,6,0.04));border-radius:12px;text-align:center;">
                    <strong>Costo total estimado:</strong> 
                    <span style="font-size:20px;font-weight:900;color:var(--azul);margin-left:8px;">${fmtMoneda(totalGal * (state.ajustes.precioGalon || 0))}</span>
                </div>`;
        }
    };

    window.cerrarReporte = function() {
        $('panelReporte').style.display = 'none';
    };

    // ---------- VISTA AJUSTES (NUEVA) ----------
    function cargarVistaAjustes() {
        const a = state.ajustes;
        if ($('ajusteEmpresa')) $('ajusteEmpresa').value = a.empresa || '';
        if ($('ajusteMoneda')) $('ajusteMoneda').value = a.moneda || 'Q';
        if ($('ajustePrecioGalon')) $('ajustePrecioGalon').value = a.precioGalon || '';
        if ($('ajustePrecioHora')) $('ajustePrecioHora').value = a.precioHora || '';
    }

    window.guardarAjustes = function() {
        state.ajustes = {
            empresa: $('ajusteEmpresa')?.value || 'Tu Empresa',
            moneda: $('ajusteMoneda')?.value || 'Q',
            precioGalon: num($('ajustePrecioGalon')?.value),
            precioHora: num($('ajustePrecioHora')?.value)
        };
        guardarDatosStorage();
        mostrarAviso('Ajustes guardados correctamente', 'exito');
    };

    window.exportarRespaldo = function() {
        const datos = {
            version: 2,
            fechaExportacion: new Date().toISOString(),
            registros: state.registros,
            archivos: state.archivos,
            ajustes: state.ajustes
        };
        
        const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `EMA_Respaldo_${fechaHoy().replace(/\//g, '-')}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        mostrarAviso('Respaldo exportado correctamente', 'exito');
        agregarNotificacion('Respaldo generado', 'Archivo JSON descargado');
    };

    window.importarRespaldo = function(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const datos = JSON.parse(e.target.result);
                if (datos.registros) {
                    confirmar('Importar respaldo', '¿Reemplazar los datos actuales con el respaldo?', () => {
                        state.registros = datos.registros || [];
                        state.archivos = datos.archivos || [];
                        state.ajustes = { ...state.ajustes, ...(datos.ajustes || {}) };
                        guardarDatosStorage();
                        actualizarTodo();
                        mostrarAviso(`Respaldo importado: ${fmt(state.registros.length)} registros`, 'exito');
                    });
                }
            } catch (err) {
                mostrarAviso('Archivo de respaldo inválido', 'error');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    // ---------- CRUD ----------
    window.agregarRegistro = function() {
        if ($('campoFecha')) $('campoFecha').value = fechaHoy();
        if ($('campoNombre')) $('campoNombre').value = '';
        if ($('campoRegion')) $('campoRegion').value = '';
        if ($('campoGasolina')) $('campoGasolina').value = 'SI';
        if ($('campoGalones')) $('campoGalones').value = '';
        if ($('campoHoraInicio')) $('campoHoraInicio').value = '';
        if ($('campoHoraFin')) $('campoHoraFin').value = '';
        if ($('campoHoras')) $('campoHoras').value = '';
        
        abrirModal('modalAgregar');
        setTimeout(() => $('campoNombre')?.focus(), 100);
    };

    window.guardarRegistro = function() {
        const nombre = $('campoNombre')?.value?.trim()?.toUpperCase();
        if (!nombre) {
            mostrarAviso('Ingresa el nombre del operador', 'aviso');
            $('campoNombre')?.focus();
            return;
        }
        
        const hi = num($('campoHoraInicio')?.value);
        const hf = num($('campoHoraFin')?.value);
        let ht = num($('campoHoras')?.value);
        if (!ht && (hi || hf)) {
            ht = hf >= hi ? hf - hi : (24 - hi) + hf;
        }
        
        const gasolina = $('campoGasolina')?.value || 'SI';
        const galones = gasolina === 'SI' ? num($('campoGalones')?.value) : 0;
        
        const nuevo = {
            id: generarId(),
            fecha: $('campoFecha')?.value?.trim() || fechaHoy(),
            nombre,
            region: $('campoRegion')?.value?.trim()?.toUpperCase() || 'SIN REGIÓN',
            horasInicio: hi,
            horasFin: hf,
            combustible: gasolina,
            galones,
            horasTrab: ht,
            fechaCreacion: Date.now()
        };
        
        state.registros.unshift(nuevo);
        guardarHistorial('agregar', { registro: nuevo });
        
        cerrarModal('modalAgregar');
        guardarDatosStorage();
        actualizarTodo();
        
        agregarNotificacion('Nuevo registro', `${nombre} · ${ht}h · ${galones}gal`);
        mostrarAviso('Registro agregado correctamente', 'exito');
    };

    window.eliminarRegistro = function(id) {
        const reg = state.registros.find(r => r.id === id);
        confirmar('Eliminar Registro', `¿Eliminar el registro de "${reg?.nombre || 'este operador'}"?`, () => {
            state.registros = state.registros.filter(r => r.id !== id);
            guardarHistorial('eliminar', { id });
            guardarDatosStorage();
            actualizarTodo();
            mostrarAviso('Registro eliminado', 'exito');
        });
    };

    // ---------- EXPORTAR ----------
    window.exportarExcel = function() {
        if (state.registros.length === 0) {
            mostrarAviso('No hay datos para exportar', 'aviso');
            return;
        }
        
        const datos = [['FECHA', 'NOMBRE', 'REGIÓN', 'HORAS INICIO', 'HORAS FIN', 'GASOLINA', 'GALONES', 'HORAS TRABAJADAS']];
        state.registros.forEach(r => {
            datos.push([r.fecha, r.nombre, r.region, r.horasInicio, r.horasFin, r.combustible, r.galones, r.horasTrab]);
        });
        
        const ws = XLSX.utils.aoa_to_sheet(datos);
        ws['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 15 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 }];
        
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Registros');
        XLSX.writeFile(wb, `EMA_Registros_${new Date().toISOString().split('T')[0]}.xlsx`);
        
        agregarNotificacion('Excel exportado', 'Archivo descargado correctamente');
        mostrarAviso('Excel descargado correctamente', 'exito');
    };

    window.limpiarTodo = function() {
        if (state.registros.length === 0) {
            mostrarAviso('No hay datos para borrar', 'aviso');
            return;
        }
        
        confirmar('⚠️ Borrar TODO', '¿Estás SEGURO? Se eliminarán TODOS los registros y archivos. Esta acción no se puede deshacer.', () => {
            localStorage.removeItem(CLAVE_STORAGE);
            location.reload();
        });
    };

    // ---------- NOTIFICACIONES ----------
    function agregarNotificacion(titulo, mensaje) {
        state.notificaciones.unshift({
            id: generarId(),
            titulo,
            mensaje,
            fecha: Date.now(),
            leida: false
        });
        
        if (state.notificaciones.length > 30) state.notificaciones.pop();
        guardarDatosStorage();
        actualizarCampana();
    }

    function actualizarCampana() {
        const punto = $('campanaPunto');
        const hayNoLeidas = state.notificaciones.some(n => !n.leida);
        if (punto) punto.style.display = hayNoLeidas ? 'block' : 'none';
    }

    window.mostrarNotificaciones = function() {
        const lista = $('listaNotificaciones');
        if (!lista) return;
        
        state.notificaciones.forEach(n => n.leida = true);
        guardarDatosStorage();
        actualizarCampana();
        
        if (state.notificaciones.length === 0) {
            lista.innerHTML = '<p class="notificaciones-vacio">No hay notificaciones</p>';
        } else {
            lista.innerHTML = state.notificaciones.slice(0, 15).map(n => `
                <div class="notificacion-item">
                    <strong>${esc(n.titulo)}</strong>
                    <span>${esc(n.mensaje)} · ${tiempoAtras(n.fecha)}</span>
                </div>
            `).join('');
        }
        
        abrirModal('modalNotificaciones');
    };

    // ---------- CHATBOT ASISTENTE IA ----------
    window.toggleChatbot = function() {
        state.chatAbierto = !state.chatAbierto;
        const ventana = $('chatbotVentana');
        if (ventana) ventana.classList.toggle('abierta', state.chatAbierto);
        if (state.chatAbierto) {
            setTimeout(() => $('chatbotInput')?.focus(), 100);
        }
    };

    window.enviarChat = function(pregunta) {
        const input = $('chatbotInput');
        const mensajes = $('chatbotMensajes');
        if (!input || !mensajes) return;
        
        const texto = (pregunta || input.value || '').trim();
        if (!texto) return;
        
        // Mensaje usuario
        mensajes.innerHTML += `
            <div class="chat-mensaje usuario">
                <div class="chat-avatar"><i class="ri-user-line"></i></div>
                <div class="chat-burbuja">${esc(texto)}</div>
            </div>`;
        
        input.value = '';
        mensajes.scrollTop = mensajes.scrollHeight;
        
        // Simular "escribiendo..."
        setTimeout(() => {
            const respuesta = generarRespuestaIA(texto);
            mensajes.innerHTML += `
                <div class="chat-mensaje bot">
                    <div class="chat-avatar"><i class="ri-robot-2-line"></i></div>
                    <div class="chat-burbuja">${respuesta}</div>
                </div>`;
            mensajes.scrollTop = mensajes.scrollHeight;
        }, 500);
    };

    function generarRespuestaIA(pregunta) {
        const p = pregunta.toLowerCase();
        const total = state.registros.length;
        
        if (total === 0 && !p.includes('hola') && !p.includes('ayuda') && !p.includes('funciones')) {
            return '📭 Aún no hay datos cargados. Puedes <strong>cargar un Excel</strong> o usar <strong>"Probar con datos"</strong> en la pantalla de inicio.';
        }
        
        if (p.includes('hola') || p.includes('buenas') || p.includes('saludos')) {
            return '¡Hola! 👋 Soy tu asistente de <strong>EMA PRO</strong>. Puedo ayudarte con:\n\n• 📊 Consultar registros\n• 🏆 Ver mejor operador\n• 📤 Cómo cargar Excel\n• 💡 Explicar funciones\n\n¿Qué necesitas?';
        }
        
        if (p.includes('cuántos') || p.includes('cuantos') || p.includes('total') || p.includes('registros')) {
            const gal = state.registros.reduce((s, r) => s + num(r.galones), 0);
            const hor = state.registros.reduce((s, r) => s + num(r.horasTrab), 0);
            const ops = new Set(state.registros.map(r => r.nombre)).size;
            return `📊 Actualmente tienes:\n\n• <strong>${fmt(total)}</strong> registros\n• <strong>${fmt(gal, 1)}</strong> galones totales\n• <strong>${fmt(hor, 1)}</strong> horas trabajadas\n• <strong>${fmt(ops)}</strong> operadores activos`;
        }
        
        if (p.includes('mejor') || p.includes('top') || p.includes('mejor operador') || p.includes('quién trabaja')) {
            const po = {};
            state.registros.forEach(r => {
                if (!po[r.nombre]) po[r.nombre] = { n: r.nombre, h: 0 };
                po[r.nombre].h += num(r.horasTrab);
            });
            const mejor = Object.values(po).sort((a, b) => b.h - a.h)[0];
            if (mejor) {
                return `🏆 El operador con más horas es:\n\n<strong>${esc(mejor.n)}</strong>\n⏱️ <strong>${fmt(mejor.h, 1)} horas</strong> trabajadas\n\n¡Excelente rendimiento! 💪`;
            }
        }
        
        if (p.includes('gasolina') || p.includes('combustible') || p.includes('galones')) {
            const con = state.registros.filter(r => r.combustible === 'SI').length;
            const sin = total - con;
            const gal = state.registros.reduce((s, r) => s + num(r.galones), 0);
            const pct = total > 0 ? (con / total * 100).toFixed(0) : 0;
            return `⛽ Análisis de gasolina:\n\n• <strong>${fmt(con)}</strong> veces SÍ echaron (${pct}%)\n• <strong>${fmt(sin)}</strong> veces NO echaron\n• <strong>${fmt(gal, 1)}</strong> galones totales consumidos`;
        }
        
        if (p.includes('cargar') || p.includes('excel') || p.includes('subir') || p.includes('importar')) {
            return '📤 Para cargar un Excel:\n\n1. Ve a <strong>Resumen</strong>\n2. Haz clic en <strong>"Cargar tu archivo Excel"</strong>\n3. O usa el botón azul <strong>"Cargar Excel"</strong> arriba\n\n📋 Formato aceptado: <strong>.xlsx, .xls, .csv</strong>\n\nEl sistema detecta automáticamente los encabezados.';
        }
        
        if (p.includes('funciones') || p.includes('qué haces') || p.includes('características') || p.includes('ayuda')) {
            return '💡 <strong>EMA PRO</strong> te ofrece:\n\n• 📊 <strong>Resumen</strong> con métricas y gráficos\n• 📋 <strong>Registros</strong> con filtros y búsqueda\n• 👥 <strong>Operadores</strong> con perfiles completos\n• 📈 <strong>Análisis</strong> inteligente y mapa de calor\n• 📄 <strong>Reportes</strong> profesionales\n• ⚙️ <strong>Ajustes</strong> personalizados\n• 🤖 <strong>Yo</strong>, tu asistente IA\n\n¡Explora el menú lateral! 🚀';
        }
        
        if (p.includes('cómo') && (p.includes('exportar') || p.includes('descargar'))) {
            return '💾 Para exportar:\n\n• Botón <strong>"Exportar Excel"</strong> en el menú inferior\n• O atajo <strong>Ctrl + E</strong>\n\nTambién puedes generar reportes en la sección <strong>"Reportes"</strong> 📄';
        }
        
        if (p.includes('tema') || p.includes('oscuro') || p.includes('claro') || p.includes('color')) {
            return '🎨 Para cambiar el tema:\n\n• Botón ☀️/🌙 en el menú inferior\n• O atajo <strong>Ctrl + T</strong>\n\n¡Prueba el modo oscuro, se ve genial! 🌙✨';
        }
        
        if (p.includes('atajo') || p.includes('teclado') || p.includes('rápido')) {
            return '⌨️ Atajos útiles:\n\n• <strong>Ctrl + K</strong> — Búsqueda global\n• <strong>Ctrl + N</strong> — Nuevo registro\n• <strong>Ctrl + E</strong> — Exportar Excel\n• <strong>Ctrl + T</strong> — Cambiar tema\n• <strong>Ctrl + M</strong> — Abrirme a mí 🤖\n• <strong>?</strong> — Ver todos los atajos';
        }
        
        if (p.includes('gracias') || p.includes('thank')) {
            return '¡De nada! 😊 Estoy aquí para ayudarte en lo que necesites. ¡Éxito con tu operación! ⛽👷💪';
        }
        
        return '🤔 No estoy seguro de entenderte. Puedes preguntarme por:\n\n• 📊 "¿Cuántos registros hay?"\n• 🏆 "¿Cuál es el mejor operador?"\n• ⛽ "Datos de gasolina"\n• 📤 "¿Cómo cargo un Excel?"\n• 💡 "¿Qué funciones tienes?"\n\n¡Inténtalo!';
    }

    // ---------- MODALES ----------
    function abrirModal(id) {
        const el = $(id);
        if (el) {
            el.classList.add('activo');
            document.body.style.overflow = 'hidden';
        }
    }

    window.cerrarModal = function(id) {
        const el = $(id);
        if (el) {
            el.classList.remove('activo');
            if (!document.querySelector('.modal-fondo.activo')) {
                document.body.style.overflow = '';
            }
        }
    };

    function confirmar(titulo, mensaje, callback) {
        const msg = $('mensajeConfirmar');
        const h3 = $('modalConfirmar')?.querySelector('h3');
        if (msg) msg.textContent = mensaje;
        if (h3) h3.innerHTML = `<i class="ri-error-warning-line"></i> ${titulo}`;
        
        const btn = $('botonConfirmar');
        if (btn) {
            btn.onclick = () => {
                cerrarModal('modalConfirmar');
                callback();
            };
        }
        
        abrirModal('modalConfirmar');
    }

    // ---------- EVENTOS GLOBALES ----------
    function configurarEventosGlobales() {
        // Cerrar modales al hacer clic fuera
        $$('.modal-fondo').forEach(m => {
            m.addEventListener('click', e => {
                if (e.target === m) {
                    m.classList.remove('activo');
                    if (!document.querySelector('.modal-fondo.activo')) {
                        document.body.style.overflow = '';
                    }
                }
            });
        });
        
        // Escape cierra todo
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                $$('.modal-fondo.activo').forEach(m => m.classList.remove('activo'));
                document.body.style.overflow = '';
                if (state.chatAbierto) toggleChatbot();
            }
        });
        
        // Auto-calcular horas en formulario
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
        
        // Enter en chat
        const chatInput = $('chatbotInput');
        if (chatInput) {
            chatInput.addEventListener('keypress', e => {
                if (e.key === 'Enter') enviarChat();
            });
        }
    }

    // ---------- AVISOS / TOASTS ----------
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
        div.className = `aviso ${tipo === 'aviso' ? 'aviso-tipo' : tipo}`;
        div.innerHTML = `<i class="${iconos[tipo] || iconos.info}"></i><span>${esc(mensaje)}</span>`;
        c.appendChild(div);
        
        setTimeout(() => {
            div.style.opacity = '0';
            div.style.transform = 'translateX(50px)';
            div.style.transition = 'all 0.35s ease';
            setTimeout(() => div.remove(), 350);
        }, 3800);
    }

    // ---------- INICIAR SISTEMA ----------
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }

})();
