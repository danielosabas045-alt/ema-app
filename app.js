// =============================================
// 🔧 SISTEMA EMA PRO - MOTOR PRINCIPAL
// =============================================

// Base de Datos Automática (se guarda siempre)
let BaseDatos = {
    compras: [],
    ventas: [],
    configuracion: { ultimaCarga: null, nombreArchivo: null }
};

// Gráficos
let graficoComparativo, graficoTendencia;

// Inicio Automático
document.addEventListener('DOMContentLoaded', () => {
    cargarBaseDatosLocal();
    configurarCargaExcel();
    configurarNavegacion();
    actualizarTodo();
    console.log('✅ Sistema EMA PRO Iniciado Perfectamente');
});

// =============================================
// 🧭 NAVEGACIÓN ENTRE SECCIONES
// =============================================
function configurarNavegacion() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            const id = link.getAttribute('href').substring(1);
            document.querySelectorAll('main > section').forEach(s => s.classList.add('d-none'));
            document.getElementById(id).classList.remove('d-none');
        });
    });
}

// =============================================
// 📁 CARGA Y ANÁLISIS DE ARCHIVO EXCEL
// =============================================
function configurarCargaExcel() {
    const input = document.getElementById('archivoExcel');
    const area = document.getElementById('areaSoltar');

    // Click
    input.addEventListener('change', e => leerArchivo(e.target.files[0]));

    // Arrastrar y Soltar
    area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('activo'); });
    area.addEventListener('dragleave', () => area.classList.remove('activo'));
    area.addEventListener('drop', e => {
        e.preventDefault();
        area.classList.remove('activo');
        leerArchivo(e.dataTransfer.files[0]);
    });
}

async function leerArchivo(archivo) {
    if (!archivo) return;
    mostrarProgreso(true, 'Leyendo archivo...');

    try {
        const datos = await archivo.arrayBuffer();
        const libro = XLSX.read(datos, { type: 'array' });
        const hoja = libro.Sheets[libro.SheetNames[0]];
        const filas = XLSX.utils.sheet_to_json(hoja, { raw: false });

        mostrarProgreso(50, 'Analizando estructura...');

        // 🧠 ANÁLISIS INTELIGENTE - DETECTA SOLO
        analizarDatosYGuardar(filas, archivo.name);

        mostrarProgreso(100, '¡Completado!');
        setTimeout(() => mostrarProgreso(false), 1500);
        notificar('exito', `Archivo "${archivo.name}" procesado con éxito`);
        
    } catch (err) {
        console.error(err);
        mostrarProgreso(false);
        notificar('error', 'Error al leer el archivo: ' + err.message);
    }
}

function analizarDatosYGuardar(filas, nombreArchivo) {
    BaseDatos.compras = [];
    BaseDatos.ventas = [];

    filas.forEach(fila => {
        const texto = JSON.stringify(fila).toLowerCase();
        const registro = normalizarRegistro(fila);

        // 🧠 DETECCIÓN INTELIGENTE AUTOMÁTICA
        if (texto.includes('compra') || texto.includes('gasto') || texto.includes('proveedor')) {
            BaseDatos.compras.push(registro);
        }
        else if (texto.includes('venta') || texto.includes('cliente') || texto.includes('ingreso')) {
            BaseDatos.ventas.push(registro);
        }
        else {
            // Si no se detecta, separamos por monto
            if (registro.monto < 0) BaseDatos.compras.push({...registro, monto: Math.abs(registro.monto)});
            else BaseDatos.ventas.push(registro);
        }
    });

    BaseDatos.configuracion.ultimaCarga = new Date().toLocaleString();
    BaseDatos.configuracion.nombreArchivo = nombreArchivo;

    guardarBaseDatosLocal();
    actualizarTodo();
    generarInformeIA(filas);
}

function normalizarRegistro(fila) {
    return {
        fecha: fila.Fecha || fila.fecha || fila['Fecha Operación'] || new Date().toLocaleDateString(),
        concepto: fila.Concepto || fila.concepto || fila.Descripcion || fila.descripcion || 'Sin descripción',
        monto: Math.abs(parseFloat(fila.Monto || fila.monto || fila.Importe || fila.importe || 0)),
        observaciones: fila.Observaciones || fila.observaciones || '',
        cliente: fila.Cliente || fila.cliente || fila.Proveedor || fila.proveedor || 'General'
    };
}

// =============================================
// 💾 BASE DE DATOS LOCAL AUTOMÁTICA
// =============================================
function guardarBaseDatosLocal() {
    localStorage.setItem('ema_compras', JSON.stringify(BaseDatos.compras));
    localStorage.setItem('ema_ventas', JSON.stringify(BaseDatos.ventas));
    localStorage.setItem('ema_config', JSON.stringify(BaseDatos.configuracion));
}

function cargarBaseDatosLocal() {
    try {
        BaseDatos.compras = JSON.parse(localStorage.getItem('ema_compras') || '[]');
        BaseDatos.ventas = JSON.parse(localStorage.getItem('ema_ventas') || '[]');
        BaseDatos.configuracion = JSON.parse(localStorage.getItem('ema_config') || '{}');
    } catch {
        BaseDatos = { compras:[], ventas:[], configuracion:{} };
    }
}

// =============================================
// 📊 ACTUALIZAR TODOS LOS DATOS Y GRÁFICOS
// =============================================
function actualizarTodo() {
    const totalCompras = BaseDatos.compras.reduce((s,r) => s + r.monto, 0);
    const totalVentas = BaseDatos.ventas.reduce((s,r) => s + r.monto, 0);
    const ganancia = totalVentas - totalCompras;
    const porcentaje = totalCompras > 0 ? ((ganancia/totalCompras)*100).toFixed(1) : 0;

    document.getElementById('totalCompras').textContent = formatoMoneda(totalCompras);
    document.getElementById('totalVentas').textContent = formatoMoneda(totalVentas);
    document.getElementById('ganancia').textContent = formatoMoneda(ganancia);
    document.getElementById('porcentajeGanancia').textContent = porcentaje + '%';
    document.getElementById('cantidadCompras').textContent = BaseDatos.compras.length + ' registros';
    document.getElementById('cantidadVentas').textContent = BaseDatos.ventas.length + ' registros';
    document.getElementById('totalRegistros').textContent = BaseDatos.compras.length + BaseDatos.ventas.length;

    actualizarTablas();
    actualizarGraficos(totalCompras, totalVentas);
}

function actualizarTablas() {
    document.getElementById('tablaCompras').innerHTML = BaseDatos.compras.map(r => `
        <tr>
            <td>${r.fecha}</td>
            <td>${r.concepto}</td>
            <td>${r.cliente}</td>
            <td>${formatoMoneda(r.monto)}</td>
            <td>${r.observaciones || '-'}</td>
            <td><button class="btn btn-sm btn-outline-danger">🗑️</button></td>
        </tr>`).join('');

    document.getElementById('tablaVentas').innerHTML = BaseDatos.ventas.map(r => `
        <tr>
            <td>${r.fecha}</td>
            <td>${r.cliente}</td>
            <td>${r.concepto}</td>
            <td>${formatoMoneda(r.monto)}</td>
            <td>${r.observaciones || '-'}</td>
            <td><button class="btn btn-sm btn-outline-danger">🗑️</button></td>
        </tr>`).join('');
}

function actualizarGraficos(compras, ventas) {
    const ctx1 = document.getElementById('graficoComparativo');
    if (graficoComparativo) graficoComparativo.destroy();
    graficoComparativo = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: ['Compras', 'Ventas'],
            datasets: [{
                label: 'Total Q',
                data: [compras, ventas],
                backgroundColor: ['#ef4444', '#10b981'],
                borderRadius: 12
            }]
        },
        options: { responsive: true, plugins: { legend:{display:false} } }
    });

    const ctx2 = document.getElementById('graficoTendencia');
    if (graficoTendencia) graficoTendencia.destroy();
    graficoTendencia = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: ['Compras', 'Ventas', 'Ganancia'],
            datasets: [{
                label: 'Quetzales',
                data: [compras, ventas, ventas-compras],
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37,99,235,0.15)',
                fill: true, tension: 0.4
            }]
        },
        options: { responsive: true }
    });
}

// =============================================
// 🤖 GENERADOR DE INFORME INTELIGENTE
// =============================================
function generarInformeIA(filas) {
    const totalCompras = BaseDatos.compras.reduce((s,r)=>s+r.monto,0);
    const totalVentas = BaseDatos.ventas.reduce((s,r)=>s+r.monto,0);
    const ganancia = totalVentas - totalCompras;
    const margen = totalCompras>0 ? ((ganancia/totalCompras)*100).toFixed(1) : 0;

    document.getElementById('informeIA').innerHTML = `
        <h6>📊 Resumen del Análisis</h6>
        <p>✅ Archivo analizado: <strong>${BaseDatos.configuracion.nombreArchivo || 'Desconocido'}</strong></p>
        <p>📅 Fecha y hora: ${BaseDatos.configuracion.ultimaCarga}</p>
        <hr>
        <p>🔢 Filas detectadas en el Excel: <strong>${filas.length}</strong></p>
        <p>🛒 Compras identificadas: <strong>${BaseDatos.compras.length}</strong> — Total: ${formatoMoneda(totalCompras)}</p>
        <p>💰 Ventas identificadas: <strong>${BaseDatos.ventas.length}</strong> — Total: ${formatoMoneda(totalVentas)}</p>
        <hr>
        <p>📈 <strong>Ganancia Estimada:</strong> ${formatoMoneda(ganancia)} (${margen}%)</p>
        <p>${ganancia >=0 ? '✅' : '⚠️'} Situación: ${ganancia >=0 ? 'GANANCIA' : 'PÉRDIDA'}</p>
        <hr>
        <p class="text-muted">💡 El sistema ha creado automáticamente la base de datos con estos registros. Se guardarán permanentemente.</p>
    `;
}

// =============================================
// 🤖 CHATBOT INTELIGENTE
// =============================================
function alternarChat() {
    document.getElementById('ventanaChat').classList.toggle('d-none');
}

function enviarMensajeChat() {
    const entrada = document.getElementById('entradaChat');
    const texto = entrada.value.trim();
    if (!texto) return;

    agregarMensajeChat('usuario', texto);
    entrada.value = '';

    // Respuesta Inteligente
    setTimeout(() => {
        const resp = generarRespuestaIA(texto.toLowerCase());
        agregarMensajeChat('ia', resp);
    }, 700);
}

function agregarMensajeChat(tipo, texto) {
    const cuerpo = document.getElementById('cuerpoChat');
    cuerpo.innerHTML += `<div class="mensaje ${tipo}">
        <strong>${tipo==='ia'?'🤖 EMA':'👤 Tú'}:</strong> ${texto}
    </div>`;
    cuerpo.scrollTop = cuerpo.scrollHeight;
}

function generarRespuestaIA(pregunta) {
    const tc = BaseDatos.compras.reduce((s,r)=>s+r.monto,0);
    const tv = BaseDatos.ventas.reduce((s,r)=>s+r.monto,0);
    const g = tv - tc;

    if (pregunta.includes('compra')) return `El total de COMPRAS es de ${formatoMoneda(tc)}. Hay ${BaseDatos.compras.length} registros guardados.`;
    if (pregunta.includes('venta')) return `El total de VENTAS es de ${formatoMoneda(tv)}. Hay ${BaseDatos.ventas.length} registros guardados.`;
    if (pregunta.includes('ganancia') || pregunta.includes('diferencia')) return `La GANANCIA es de ${formatoMoneda(g)} (${g>=0?'positiva':'negativa'}).`;
    if (pregunta.includes('cuantos') || pregunta.includes('registros')) return `En total hay ${BaseDatos.compras.length+BaseDatos.ventas.length} registros: ${BaseDatos.compras.length} compras y ${BaseDatos.ventas.length} ventas.`;
    if (pregunta.includes('fecha') || pregunta.includes('cuando')) return `La última carga fue: ${BaseDatos.configuracion.ultimaCarga || 'No hay fecha registrada'}`;
    if (pregunta.includes('hola')) return '¡Hola! 👋 Estoy aquí para ayudarte. Pregúntame sobre tus compras, ventas, totales...';
    return `He analizado tus datos. Compras: ${formatoMoneda(tc)} | Ventas: ${formatoMoneda(tv)} | Ganancia: ${formatoMoneda(g)}. ¿En qué más te ayudo?`;
}

// =============================================
// 🔧 UTILIDADES
// =============================================
function formatoMoneda(cantidad) {
    return 'Q ' + cantidad.toLocaleString('es-GT', {minimumFractionDigits:2});
}

function mostrarProgreso(mostrar, texto='') {
    const caja = document.getElementById('barraProgreso');
    const barra = document.getElementById('barraCarga');
    const text = document.getElementById('textoProgreso');
    if (mostrar===true) {
        caja.classList.remove('d-none');
        barra.style.width = '0%';
        text.textContent = texto;
    } else if (typeof mostrar === 'number') {
        barra.style.width = mostrar + '%';
        text.textContent = texto;
    } else {
        caja.classList.add('d-none');
    }
}

function notificar(tipo, mensaje) {
    const contenedor = document.querySelector('.toast-container');
    const color = tipo==='exito'?'bg-success':tipo==='error'?'bg-danger':'bg-primary';
    const icono = tipo==='exito'?'✅':tipo==='error'?'❌':'ℹ️';
    contenedor.innerHTML = `<div class="toast align-items-center text-white ${color} border-0 show" role="alert">
        <div class="d-flex">
            <div class="toast-body">${icono} ${mensaje}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    </div>`;
}

// Funciones rápidas
function exportarTodo() {
    const hoja = XLSX.utils.json_to_sheet([...BaseDatos.compras.map(r=>({Tipo:'COMPRA',...r})), ...BaseDatos.ventas.map(r=>({Tipo:'VENTA',...r}))]);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Datos Completos');
    XLSX.writeFile(libro, 'EMA_BaseDeDatos_Completa.xlsx');
    notificar('exito', '✅ Base de Datos Exportada');
}

function limpiarBaseDatos() {
    if(confirm('¿Eliminar TODOS los datos? Esta acción no se puede deshacer.')) {
        localStorage.clear();
        BaseDatos = {compras:[], ventas:[], configuracion:{}};
        actualizarTodo();
        notificar('exito', '🗑️ Base de Datos Limpiada');
    }
}

function respaldarDatos() {
    const datos = btoa(JSON.stringify(BaseDatos,null,2));
    const a = document.createElement('a');
    a.href = 'data:application/json;base64,' + datos;
    a.download = 'EMA_Respaldado_' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    notificar('exito', '✅ Respaldo Generado');
}

// Funciones de ejemplo para agregar registros manualmente
function agregarCompraManual() { alert('Puedes agregar manualmente aquí'); }
function agregarVentaManual() { alert('Puedes agregar manualmente aquí'); }
