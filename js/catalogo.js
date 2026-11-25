/* Catálogo público: solo lectura, sin sesión */
'use strict';

const db = supabase.createClient(AMATHEA.supabaseUrl, AMATHEA.supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

// Deben coincidir con los permisos del SQL: nunca incluir comprador ni distribución
const COLUMNAS_PUBLICAS =
  'id,nombre,tipo,color,peso,talla,descripcion,foto,foto_modelo,joyero,precio,estado,fecha_creacion';

const COLECCIONES = {
  '': { titulo: 'Todas las piezas', texto: 'Filigrana de plata tejida hilo a hilo. Cada pieza es única.' },
  anillo: { titulo: 'Anillos de Libertad', imagen: 'col-anillos', foto: 'foto-anillos', texto: 'La libertad es el tesoro más preciado, y cada anillo representa ese vuelo hacia nuevos comienzos: símbolo de valentía, decisión y un futuro propio.' },
  arete: { titulo: 'Aretes de Paz', imagen: 'col-aretes', foto: 'foto-aretes', texto: 'La paz es un camino que se elige cada día. Llévelos como recordatorio de su fuerza interior y del poder de la serenidad.' },
  dije: { titulo: 'Dijes Renacer', imagen: 'col-dijes', foto: 'foto-dijes', texto: 'Cada dije representa transformación y nuevos comienzos. Como la mariposa, renacer es descubrir la propia luz y volar alto.' },
  pulsera: { titulo: 'Pulseras', texto: 'Hilos de plata que acompañan cada paso.' }
};

const PLURALES = {
  anillo: 'Anillos', arete: 'Aretes', dije: 'Dijes', pulsera: 'Pulseras',
  servicio: 'Servicios', patrocinio: 'Patrocinios'
};

const POR_TANDA = 12;
const estado = { piezas: [], autores: new Map(), tipo: '', visibles: POR_TANDA };

const infoAutor = nombre => estado.autores.get(nombre) || { nombre };
const mostrarAutor = nombre => infoAutor(nombre).nombre_visible || nombre || 'Amathea';
const textoAutor = nombre => infoAutor(nombre).descripcion
  || 'Artesano de Amathea. Por seguridad firma sus piezas con una palabra fuerza que representa quién es hoy.';

function tituloBicolor(nombre) {
  const partes = String(nombre || 'Pieza').trim().split(/\s+/);
  if (partes.length < 2) return esc(partes[0]);
  const ultima = partes.pop();
  return `${esc(partes.join(' '))} <em>${esc(ultima)}</em>`;
}

function enlaceWhatsApp(mensaje) {
  return `https://wa.me/${AMATHEA.whatsapp}?text=${encodeURIComponent(mensaje)}`;
}

function foto(pieza, perezosa = true) {
  const url = urlSegura(pieza.foto);
  if (!url) return '<img class="sin-foto" src="assets/img/mariposa.webp" alt="Pieza sin fotografía">';
  return `<img data-foto src="${esc(url)}" alt="${esc(pieza.nombre)}" ${perezosa ? 'loading="lazy"' : ''}>`;
}

/* Segunda foto: la pieza puesta */
function fotoPuesta(pieza, clase) {
  const url = urlSegura(pieza.foto_modelo);
  return url
    ? `<img class="${clase}" src="${esc(url)}" alt="${esc(pieza.nombre)}, puesta" loading="lazy">`
    : '';
}

function galeria(p) {
  const vistas = [['La pieza', urlSegura(p.foto)], ['Puesta', urlSegura(p.foto_modelo)]]
    .filter(([, url]) => url);
  if (vistas.length < 2) return foto(p, false);
  return `
    <img id="foto-grande" src="${esc(vistas[0][1])}" alt="${esc(p.nombre)}">
    <div class="miniaturas" role="group" aria-label="Fotografías">
      ${vistas.map(([titulo, url], i) => `
        <button type="button" data-foto-ver="${esc(url)}" aria-pressed="${i === 0}">
          <img src="${esc(url)}" alt=""><span>${titulo}</span>
        </button>`).join('')}
    </div>`;
}

function filtradas() {
  const texto = $('#f-texto').value.trim().toLowerCase();
  const autor = $('#f-autor').value;
  const orden = $('#f-orden').value;
  const lista = estado.piezas.filter(p =>
    (!estado.tipo || p.tipo === estado.tipo) &&
    (!autor || p.joyero === autor) &&
    (!texto || String(p.nombre || '').toLowerCase().includes(texto)));
  if (orden === 'precio-asc') lista.sort((a, b) => a.precio - b.precio);
  if (orden === 'precio-desc') lista.sort((a, b) => b.precio - a.precio);
  if (orden === 'nombre') lista.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
  return lista;
}

function pintarRejilla() {
  const lista = filtradas();
  $('#conteo').textContent = lista.length === 0
    ? 'No hay piezas disponibles con estos filtros.'
    : `${lista.length} ${lista.length === 1 ? 'pieza disponible' : 'piezas disponibles'}`;
  $('#rejilla').innerHTML = lista.slice(0, estado.visibles).map(p => `
    <article class="pieza">
      <button type="button" class="pieza-foto" data-ver="${esc(p.id)}" aria-label="Ver ${esc(p.nombre)}">
        ${foto(p)}
        ${fotoPuesta(p, 'puesta')}
        ${urlSegura(p.foto_modelo) ? '<span class="marca-fotos">2 fotos</span>' : ''}
        <span class="ver">Ver pieza</span>
      </button>
      <div class="pieza-datos">
        <p class="pieza-tipo">${esc(nombreTipo(p.tipo))}</p>
        <h3>${tituloBicolor(p.nombre)}</h3>
        <button type="button" class="autor" data-autor="${esc(p.joyero || '')}">Autor: <strong>${esc(mostrarAutor(p.joyero))}</strong></button>
        <p class="precio">${dinero(p.precio)}</p>
      </div>
    </article>`).join('');
  $('#ver-mas').hidden = lista.length <= estado.visibles;
}

function pintarColeccion() {
  const c = COLECCIONES[estado.tipo] || { titulo: PLURALES[estado.tipo] || nombreTipo(estado.tipo), texto: '' };
  $('#coleccion').innerHTML = `
    <div>
      ${c.imagen
        ? `<h2><img src="assets/img/${c.imagen}.webp" alt="${esc(c.titulo)}"></h2>`
        : `<h2>${tituloBicolor(c.titulo)}</h2>`}
      <p>${esc(c.texto)}</p>
    </div>
    ${c.foto ? `<img class="coleccion-foto" src="assets/img/${c.foto}.webp" alt="">` : ''}`;
}

function pintarCintas() {
  const presentes = new Set(estado.piezas.map(p => p.tipo).filter(Boolean));
  const base = ['anillo', 'arete', 'dije', 'pulsera'];
  const tipos = base.concat([...presentes].filter(t => !base.includes(t)));
  $('#cintas').innerHTML = [''].concat(tipos).map(t => `
    <button type="button" data-tipo="${esc(t)}" aria-pressed="${t === estado.tipo}">
      ${esc(t ? (PLURALES[t] || nombreTipo(t)) : 'Todas')}
    </button>`).join('');
}

function pintarFiltroAutor() {
  const nombres = [...new Set(estado.piezas.map(p => p.joyero).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  $('#f-autor').innerHTML = '<option value="">Todos</option>' +
    nombres.map(n => `<option value="${esc(n)}">${esc(mostrarAutor(n))}</option>`).join('');
}

function pintarArtesanos() {
  let nombres = [...estado.autores.keys()];
  if (nombres.length === 0) {
    nombres = [...new Set(estado.piezas.map(p => p.joyero).filter(Boolean))];
  }
  nombres.sort((a, b) => a.localeCompare(b, 'es'));
  $('#lista-artesanos').innerHTML = nombres.map(n => `
    <button type="button" class="artesano" data-autor="${esc(n)}">
      <img src="assets/img/mariposa.webp" alt="" loading="lazy">
      <span>${esc(mostrarAutor(n))}</span>
    </button>`).join('');
}

/* Globo con información del autor */
const globo = $('#globo');
let anclaGlobo = null;

function abrirGlobo(ancla) {
  const nombre = ancla.dataset.autor;
  if (!nombre) return;
  const piezas = estado.piezas.filter(p => p.joyero === nombre).length;
  globo.innerHTML = `
    <p class="globo-nombre">${esc(mostrarAutor(nombre))}</p>
    <p>${esc(textoAutor(nombre))}</p>
    ${piezas
      ? `<button type="button" data-filtrar="${esc(nombre)}">Ver sus piezas disponibles (${piezas})</button>`
      : '<p class="tenue">Sin piezas disponibles por ahora.</p>'}`;
  (ancla.closest('dialog') || document.body).appendChild(globo);
  globo.hidden = false;
  anclaGlobo = ancla;
  const r = ancla.getBoundingClientRect();
  const ancho = globo.offsetWidth;
  const alto = globo.offsetHeight;
  const x = Math.min(Math.max(12, r.left + r.width / 2 - ancho / 2), window.innerWidth - ancho - 12);
  const y = r.bottom + alto + 12 > window.innerHeight ? r.top - alto - 6 : r.bottom + 6;
  globo.style.left = `${x}px`;
  globo.style.top = `${Math.max(8, y)}px`;
}

function cerrarGlobo() {
  globo.hidden = true;
  anclaGlobo = null;
}

let espera;
const conRaton = window.matchMedia('(hover: hover)').matches;
if (conRaton) {
  document.addEventListener('mouseover', e => {
    const ancla = e.target.closest('[data-autor]');
    if (ancla) {
      clearTimeout(espera);
      if (ancla !== anclaGlobo) abrirGlobo(ancla);
    } else if (e.target.closest('#globo')) {
      clearTimeout(espera);
    } else if (anclaGlobo) {
      clearTimeout(espera);
      espera = setTimeout(cerrarGlobo, 250);
    }
  });
}
document.addEventListener('focusin', e => {
  const ancla = e.target.closest('[data-autor]');
  if (ancla && ancla.matches(':focus-visible')) abrirGlobo(ancla);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarGlobo(); });
window.addEventListener('scroll', cerrarGlobo, { passive: true });

/* Ficha de una pieza */
const ficha = $('#ficha');

function abrirFicha(id) {
  const p = estado.piezas.find(x => String(x.id) === String(id));
  if (!p) {
    avisar('Esa pieza ya no está disponible.', 'error');
    return;
  }
  cerrarGlobo();
  history.replaceState(null, '', `#pieza-${p.id}`);
  const enlace = location.href;
  const datos = [
    ['Tipo', esc(nombreTipo(p.tipo))],
    ['Peso', Number(p.peso) > 0 ? `${numero(p.peso)} g` : ''],
    ['Talla', esc(p.talla)],
    ['Color', p.color ? `${puntosColor(p.color)} ${esc(p.color)}` : '']
  ].filter(([, v]) => v);
  $('#ficha-cuerpo').innerHTML = `
    <div class="ficha-foto">${galeria(p)}</div>
    <div class="ficha-texto">
      <h2 id="ficha-titulo">${tituloBicolor(p.nombre)}</h2>
      <button type="button" class="autor" data-autor="${esc(p.joyero || '')}">Autor: <strong>${esc(mostrarAutor(p.joyero))}</strong></button>
      ${p.descripcion ? `<p class="descripcion">${esc(p.descripcion)}</p>` : ''}
      <dl>${datos.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      <p class="precio">${dinero(p.precio)}</p>
      <div class="acciones">
        <a class="boton" target="_blank" rel="noopener" href="${esc(enlaceWhatsApp(
          `Hola, me interesa la pieza "${p.nombre}" (autor: ${mostrarAutor(p.joyero)}) del catálogo de Amathea. ${enlace}`
        ))}">Preguntar por WhatsApp</a>
        <button type="button" class="boton boton-linea" id="compartir">Compartir</button>
      </div>
    </div>`;
  if (!ficha.open) ficha.showModal();
}

ficha.addEventListener('close', () => {
  cerrarGlobo();
  document.body.appendChild(globo);
  history.replaceState(null, '', location.pathname + location.search);
});
ficha.addEventListener('click', e => { if (e.target === ficha) ficha.close(); });

async function compartir() {
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Amathea', url: location.href });
    } else {
      await navigator.clipboard.writeText(location.href);
      avisar('Enlace copiado.');
    }
  } catch (e) {
    if (e.name !== 'AbortError') avisar('No se pudo compartir. Copie la dirección del navegador.', 'error');
  }
}

function elegirTipo(tipo) {
  estado.tipo = tipo;
  estado.visibles = POR_TANDA;
  pintarCintas();
  pintarColeccion();
  pintarRejilla();
}

document.addEventListener('click', e => {
  const mini = e.target.closest('[data-foto-ver]');
  if (mini) {
    $('#foto-grande').src = mini.dataset.fotoVer;
    $$('[data-foto-ver]').forEach(b => b.setAttribute('aria-pressed', b === mini));
    return;
  }
  const cinta = e.target.closest('[data-tipo]');
  if (cinta) {
    elegirTipo(cinta.dataset.tipo);
    $('#catalogo').scrollIntoView();
    return;
  }
  const ver = e.target.closest('[data-ver]');
  if (ver) { abrirFicha(ver.dataset.ver); return; }
  const filtrar = e.target.closest('[data-filtrar]');
  if (filtrar) {
    cerrarGlobo();
    if (ficha.open) ficha.close();
    $('#f-texto').value = '';
    $('#f-autor').value = filtrar.dataset.filtrar;
    elegirTipo('');
    $('#catalogo').scrollIntoView();
    return;
  }
  const autor = e.target.closest('[data-autor]');
  if (autor) { abrirGlobo(autor); return; }
  if (e.target.id === 'compartir') compartir();
  if (!e.target.closest('#globo')) cerrarGlobo();
});

['#f-texto', '#f-autor', '#f-orden'].forEach(s => $(s).addEventListener('input', () => {
  estado.visibles = POR_TANDA;
  pintarRejilla();
}));
$('#f-limpiar').addEventListener('click', () => {
  $('#f-texto').value = '';
  $('#f-autor').value = '';
  $('#f-orden').value = 'recientes';
  elegirTipo('');
});
$('#ver-mas').addEventListener('click', () => {
  estado.visibles += POR_TANDA;
  pintarRejilla();
});

function pintarContacto() {
  $('#wa-general').href = enlaceWhatsApp('Hola, quiero conocer más sobre las joyas de Amathea.');
  $('#datos-contacto').innerHTML = `
    <li><span>Dirección</span>${esc(AMATHEA.direccion)}</li>
    <li><span>WhatsApp</span>${esc(AMATHEA.whatsappVisible)}</li>
    <li><span>Instagram</span><a href="https://www.instagram.com/${esc(AMATHEA.instagram)}/" target="_blank" rel="noopener">@${esc(AMATHEA.instagram)}</a></li>
    <li><span>Web</span><a href="https://${esc(AMATHEA.web)}" target="_blank" rel="noopener">${esc(AMATHEA.web)}</a></li>`;
}

async function iniciar() {
  pintarContacto();
  pintarCintas();
  pintarColeccion();
  try {
    const [piezas, autores] = await Promise.all([
      traerTodo(() => db.from('joyas').select(COLUMNAS_PUBLICAS)
        .eq('estado', 'Catálogo')
        .order('fecha_creacion', { ascending: false })
        .order('id', { ascending: false })),
      db.from('autores').select('nombre,nombre_visible,descripcion').eq('visible', true)
    ]);
    estado.piezas = piezas;
    estado.autores = new Map((autores.data || []).map(a => [a.nombre, a]));
    pintarCintas();
    pintarFiltroAutor();
    pintarRejilla();
    pintarArtesanos();
    const pedido = location.hash.match(/^#pieza-(.+)$/);
    if (pedido) abrirFicha(pedido[1]);
  } catch (error) {
    console.error(error);
    $('#conteo').textContent = 'No fue posible cargar el catálogo. Intente de nuevo en unos minutos.';
  }
}

iniciar();
