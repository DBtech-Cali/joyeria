/* Utilidades compartidas entre el catálogo y la administración */
'use strict';

const TIPOS = {
  arete: 'Arete', anillo: 'Anillo', pulsera: 'Pulsera', dije: 'Dije',
  servicio: 'Servicio', patrocinio: 'Patrocinio'
};

const ESTADOS = ['Catálogo', 'Reservada', 'Vendido', 'Alquiler', 'Donación', 'Servicio', 'Patrocinio'];

// Respaldo si la tabla "autores" no responde
const JOYEROS_BASE = [
  'Amor', 'Paciencia', 'Sabiduria', 'Cariño', 'Transformación', 'Libertad', 'Esperanza',
  'Concentración', 'Fortaleza', 'Ilustración', 'Corazón', 'Creación', 'Pensamiento',
  'Paz', 'Esfuerzo', 'Silencio', 'Ilusión', 'Amathea'
];

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

/* Todo texto que venga de la base pasa por aquí antes de insertarse como HTML */
function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* Acepta http(s), imágenes incrustadas y rutas relativas; rechaza otros esquemas */
function urlSegura(url) {
  const u = String(url ?? '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u) || /^data:image\//i.test(u)) return u;
  return /^[a-z][a-z0-9+.-]*:/i.test(u) ? '' : u;
}

const formatoNumero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
const numero = v => formatoNumero.format(Number(v) || 0);
function dinero(v) {
  const n = Number(v) || 0;
  return (n < 0 ? '-$' : '$') + numero(Math.abs(n));
}

const nombreTipo = t => TIPOS[t] || t || '—';

const COLORES = [
  [/plata|platead/, '#b9bcc2'], [/celeste|aguamarina|turquesa/, '#35a7e0'], [/azul/, '#1f46c9'],
  [/roj|rub[ií]|fucsia/, '#b3122f'], [/verde|esmeralda/, '#14724a'], [/negr|oscur/, '#1d1d1f'],
  [/blanc|perla/, '#fbf8f1'], [/ros/, '#e58aa8'], [/dorad|\boro\b/, '#c9a24a'],
  [/morad|violeta|lila/, '#7a4a9c'], [/amarill/, '#e8bd2c'], [/naranja/, '#e9821f']
];

function puntosColor(texto) {
  const t = String(texto ?? '').toLowerCase();
  return COLORES.filter(([re]) => re.test(t))
    .map(([, c]) => `<i class="punto" style="background:${c}" aria-hidden="true"></i>`)
    .join('');
}

/* Trae todas las filas, aunque pasen del límite de 1.000 por consulta de Supabase */
async function traerTodo(crearConsulta) {
  const tam = 1000;
  let desde = 0;
  let filas = [];
  for (;;) {
    const { data, error } = await crearConsulta().range(desde, desde + tam - 1);
    if (error) throw error;
    filas = filas.concat(data || []);
    if (!data || data.length < tam) return filas;
    desde += tam;
  }
}

function avisar(mensaje, tipo = 'ok') {
  let caja = $('#avisos');
  if (!caja) {
    caja = document.createElement('div');
    caja.id = 'avisos';
    caja.setAttribute('role', 'status');
    document.body.appendChild(caja);
  }
  const abierto = $('dialog[open]');
  (abierto || document.body).appendChild(caja);
  const nota = document.createElement('p');
  nota.className = 'aviso aviso-' + tipo;
  nota.textContent = mensaje;
  caja.appendChild(nota);
  setTimeout(() => nota.remove(), tipo === 'error' ? 8000 : 4000);
}

/* Cerrar diálogos con el botón ✕ o al tocar el fondo */
document.addEventListener('click', e => {
  const cerrar = e.target.closest('[data-cerrar]');
  if (cerrar) cerrar.closest('dialog')?.close();
});

/* Si una foto no carga, mostrar la mariposa en su lugar */
document.addEventListener('error', e => {
  const img = e.target;
  if (img.tagName === 'IMG' && img.dataset.foto !== undefined) {
    img.removeAttribute('data-foto');
    img.src = 'assets/img/mariposa.webp';
    img.classList.add('sin-foto');
  }
}, true);
