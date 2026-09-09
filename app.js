/* ============================================
   EMA PRO - JavaScript Súper Robusto
   Lectura Excel mejorada, todas las funciones
============================================ */

(function() {
    'use strict';

    const CLAVE_STORAGE = 'ema_pro_datos_v3';
    const REGISTROS_POR_PAGINA = 15;

    const state = {
        registros: [],
        archivos: [],
        vistaActiva: 'resumen',
        paginaActual: 1,
        filtroGasolina: null,
        filtroRegion: null,
        busqueda: '',
        ordenColumna: 'fechaCreacion',
        ordenDireccion: 'desc',
        tema: 'light',
        graficos: {},
        notificaciones: [],
        ajustes: {
            empresa: 'Tu Empresa',
            moneda: 'Q',
            precioGalon: 25.50,
            precioHora: 45.00
        },
        chatAbierto: false
    };

    // ========== UTILIDADES ==========
    const $ = (id) => document.getElementById(id);
    const $$ = (sel) => document.querySelectorAll(sel);

    const esc = (v) => {
        if (v == null) return '';
        return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    const num = (v) => {
        if (typeof v === 'number') return isFinite(v) ? v : 0;
        if (!v && v !== 0) return 0;
        if (v instanceof Date) return 0;
        const s = String(v).replace(/,/g, '.').replace(/[^0-9.\-]/g, '');
        const n = parseFloat(s);
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

    // ========== INICIO ==========
    function iniciar() {
        cargarDatos();
        configurarCarga();
        configurarEventos();
        iniciarReloj();
        iniciarAtajos();
        
        if (state.registros.length > 0) {
            ocultarInicio();
        }
        
        aplicarTema(state.tema);
        actualizarTodo();
    }

    // ========== ALMACENAMIENTO ==========
    function cargarDatos() {
        try {
            const raw = localStorage.getItem(CLAVE_STORAGE);
            if (raw) {
                const d = JSON.parse(raw);
                state.registros = Array.isArray(d.registros) ? d.registros : [];
                state.archivos = Array.isArray(d.archivos) ? d.archivos : [];
                state.tema = d.tema || 'light';
                state.ajustes = { ...state.ajustes, ...(d.ajustes || {}) };
                state.notificaciones = Array.isArray(d.notificaciones) ? d.notificaciones : [];
            }
        } catch (e) {
            console.warn('Error cargando datos:', e);
            state.registros = [];
            state.archivos = [];
        }
    }

    function guardarDatos() {
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
            mostrarAviso('Error al guardar datos', 'error');
            return false;
        }
    }

    // ========== PANTALLA INICIO ==========
    function ocultarInicio() {
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
        ocultarInicio();
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
        
        guardarDatos();
        ocultarInicio();
        actualizarTodo();
        agregarNotificacion('Datos de ejemplo', '80 registros cargados correctamente');
        mostrarAviso('¡80 registros de ejemplo cargados!', 'exito');
    };

    // ========== NAVEGACIÓN ==========
    window.cambiarVista = function(vista) {
        state.vistaActiva = vista;
        state.paginaActual = 1;
        
        $$('.vista').forEach(v => v.classList.remove('activa'));
        const vEl = $('vista-' + vista);
        if (vEl) vEl.classList.add('activa');
        
        $$('.menu-item').forEach(i => i.classList.remove('activo'));
        const mEl = $('menu-' + vista);
        if (mEl) mEl.classList.add('activa');
        
        const titulos = {
            resumen: 'Resumen', registros: 'Registros', operadores: 'Operadores',
            analisis: 'Análisis', reportes: 'Reportes', archivos: 'Archivos', ajustes: 'Ajustes'
        };
        
        const migas = $('migasVista');
        if (migas) migas.textContent = titulos[vista] || vista;
        
        $('menuLateral')?.classList.remove('abierto');
        
        setTimeout(() => {
            if (vista === 'registros') renderizarRegistros();
            if (vista === 'operadores') renderizarOperadores();
            if (vista === 'archivos') renderizarArchivos();
            if (vista === 'analisis') renderizarAnalisis();
            if (vista === 'reportes') { if ($('panelReporte')) $('panelReporte').style.display = 'none'; }
            if (vista === 'ajustes') cargarAjustes();
        }, 60);
    };

    window.toggleMenu = function() {
        $('menuLateral')?.classList.toggle('abierto');
    };

    // ========== TEMA ==========
    window.cambiarTema = function() {
        state.tema = state.tema === 'light' ? 'dark' : 'light';
        aplicarTema(state.tema);
        guardarDatos();
        setTimeout(renderizarGraficos, 120);
        mostrarAviso(`Modo ${state.tema === 'light' ? 'claro' : 'oscuro'} activado`, 'info');
    };

    function aplicarTema(tema) {
        document.documentElement.setAttribute('data-theme', tema);
        const icono = $('iconoTema');
        if (icono) icono.className = tema === 'light' ? 'ri-sun-line' : 'ri-moon-line';
    }

    window.pantallaCompleta = function() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
    };

    // ========== RELOJ ==========
    function iniciarReloj() {
        const actualizar = () => {
            const el = $('relojVivo');
            if (el) el.textContent = horaActual();
        };
        actualizar();
        setInterval(actualizar, 1000);
    }

    // ========== ATAJOS ==========
    function iniciarAtajos() {
        document.addEventListener('keydown', (e) => {
            const ctrl = e.ctrlKey || e.metaKey;
            
            if (ctrl && e.key.toLowerCase() === 'n') { e.preventDefault(); agregarRegistro(); }
            if (ctrl && e.key.toLowerCase() === 'e') { e.preventDefault(); exportarExcel(); }
            if (ctrl && e.key.toLowerCase() === 't') { e.preventDefault(); cambiarTema(); }
            if (ctrl && e.key.toLowerCase() === 'm') { e.preventDefault(); toggleChatbot(); }
            if (e.key === '?') { mostrarAtajos(); }
            if (e.key === 'Escape') {
                $$('.modal-fondo.activo').forEach(m => m.classList.remove('activo'));
                document.body.style.overflow = '';
                if (state.chatAbierto) toggleChatbot();
            }
        });
    }

    window.mostrarAtajos = function() {
        abrirModal('modalAtajos');
    };

    // ========== CARGA EXCEL - SÚPER ROBUSTA ==========
    function configurarCarga() {
        const zonas = [ $('zonaCarga'), $('zonaCargaArchivos') ];
        const input = $('cargarArchivo');
        
        zonas.forEach(zona => {
            if (!zona) return;
            zona.addEventListener('click', () => input?.click());
            zona.addEventListener('dragover', e => { e.preventDefault(); zona.classList.add('activa'); });
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
        for (const file of files
