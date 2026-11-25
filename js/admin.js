/* Gestión del taller. La seguridad real la aplican las políticas RLS en Supabase. */
'use strict';

// La sesión se borra al cerrar la pestaña
const db = supabase.createClient(AMATHEA.supabaseUrl, AMATHEA.supabaseKey, {
  auth: { storage: window.sessionStorage }
});

const MINUTOS_INACTIVIDAD = 30;
const datos = { joyas: [], egresos: [], autores: [] };
let vista = 'inventario';
let enEdicion = null;      // joya abierta en el diálogo
let enVenta = null;        // joya que se está vendiendo
let egresoActual = null;   // null = egreso nuevo
let graficas = [];

/* ---------- Sesión ---------- */
async function entrarSiEsAdmin() {
  const { data } = await db.auth.getSession();
  if (!data.session) return mostrarAcceso();
  const { data: esAdmin, error } = await db.rpc('es_admin');
  if (error || esAdmin !== true) {
    await db.auth.signOut();
    return mostrarAcceso(error
      ? 'No se pudo verificar el permiso. Confirme que ejecutó el script SQL.'
      : 'Este usuario no tiene permiso de administración.');
  }
  $('#quien').textContent = data.session.user.email;
  $('#acceso').hidden = true;
  $('#panel').hidden = false;
  reiniciarInactividad();
  await recargar();
}

function mostrarAcceso(mensaje = '') {
  $$('dialog[open]').forEach(d => d.close());
  datos.joyas = []; datos.egresos = []; datos.autores = [];
  $$('tbody, #inventario, .cifras, .joyeros, #lista-autores, #egresos-joyero').forEach(n => { n.innerHTML = ''; });
  $('#panel').hidden = true;
  $('#acceso').hidden = false;
  $('#error-acceso').textContent = mensaje;
}

$('#form-acceso').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  await ocupado(f, async () => {
    $('#error-acceso').textContent = '';
    const { error } = await db.auth.signInWithPassword({
      email: f.elements.correo.value.trim(),
      password: f.elements.clave.value
    });
    f.elements.clave.value = '';
    if (error) {
      $('#error-acceso').textContent = error.status === 400
        ? 'Correo o contraseña incorrectos.'
        : 'No fue posible ingresar. Revise la conexión e intente más tarde.';
      return;
    }
    await entrarSiEsAdmin();
  });
});

async function salir(mensaje) {
  await db.auth.signOut();
  mostrarAcceso(mensaje);
}
$('#salir').addEventListener('click', () => salir());

let temporizador;
function reiniciarInactividad() {
  clearTimeout(temporizador);
  if ($('#panel').hidden) return;
  temporizador = setTimeout(
    () => salir('La sesión se cerró por inactividad.'), MINUTOS_INACTIVIDAD * 60000);
}
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, reiniciarInactividad));

/* ---------- Datos ---------- */
async function recargar() {
  try {
    const [joyas, egresos, autores] = await Promise.all([
      traerTodo(() => db.from('joyas').select('*')
        .order('fecha_creacion', { ascending: false }).order('id', { ascending: false })),
      traerTodo(() => db.from('egreso').select('*').order('id', { ascending: false })),
      traerTodo(() => db.from('autores').select('*').order('nombre'))
    ]);
    Object.assign(datos, { joyas, egresos, autores });
    llenarListas();
    pintar();
  } catch (error) {
    console.error(error);
    avisar('No se pudieron cargar los datos: ' + error.message, 'error');
  }
}

async function ocupado(formulario, tarea) {
  const botones = $$('button', formulario);
  if (formulario.dataset.ocupado) return;
  formulario.dataset.ocupado = '1';
  botones.forEach(b => { b.disabled = true; });
  try {
    await tarea();
  } catch (error) {
    console.error(error);
    avisar('Ocurrió un error: ' + error.message, 'error');
  } finally {
    delete formulario.dataset.ocupado;
    botones.forEach(b => { b.disabled = false; });
  }
}

/* Confirma que la operación afectó una fila (RLS puede bloquear sin devolver error) */
async function guardar(consulta) {
  const { data, error } = await consulta.select('*');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('No se guardó el cambio. El registro cambió o no tiene permiso.');
  }
  return data[0];
}

/* ---------- Listas desplegables ---------- */
function nombresJoyeros() {
  const nombres = datos.autores.length ? datos.autores.map(a => a.nombre) : JOYEROS_BASE.slice();
  datos.joyas.forEach(j => { if (j.joyero && !nombres.includes(j.joyero)) nombres.push(j.joyero); });
  return nombres.sort((a, b) => a.localeCompare(b, 'es'));
}

function opciones(select, lista, vacia) {
  const previo = select.value;
  select.innerHTML = (vacia === undefined ? '' : `<option value="">${esc(vacia)}</option>`) +
    lista.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
  if ([...select.options].some(o => o.value === previo)) select.value = previo;
}

/* Conserva valores antiguos que no estén en la lista, para no sobrescribirlos */
function elegir(select, valor) {
  const v = valor ?? '';
  if (![...select.options].some(o => o.value === v)) {
    select.add(new Option(v || '(sin dato)', v));
  }
  select.value = v;
}

function llenarListas() {
  const joyeros = nombresJoyeros().map(n => [n, n]);
  const tipos = Object.entries(TIPOS);
  const estados = ESTADOS.map(e => [e, e]);
  $$('.barra select[data-f="joyero"]').forEach(s => opciones(s, joyeros, 'Todos'));
  $$('.barra select[data-f="tipo"]').forEach(s => opciones(s, tipos, 'Todos'));
  $$('.barra select[data-f="estado"]').forEach(s => opciones(s, estados, 'Todos'));
  $$('[data-campos-joya] [name="joyero"]').forEach(s => opciones(s, joyeros));
  $('#lista-joyeros').innerHTML = joyeros.map(([n]) => `<option value="${esc(n)}">`).join('');
}

/* ---------- Formulario de joya (agregar y editar) ---------- */
function plantillaCamposJoya() {
  const op = lista => lista.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
  return `
    <label>Nombre *<input type="text" name="nombre" required></label>
    <label>Precio *<input type="number" name="precio" min="0" step="any" required></label>
    <label>Tipo<select name="tipo">${op(Object.entries(TIPOS))}</select></label>
    <label>Estado<select name="estado">${op(ESTADOS.map(e => [e, e]))}</select></label>
    <label>Joyero<select name="joyero"></select></label>
    <label>Peso (g)<input type="number" name="peso" min="0" step="any"></label>
    <label>Talla<input type="text" name="talla"></label>
    <label>Color<input type="text" name="color" placeholder="Plata, azul…"></label>
    <label class="completo">Descripción para el catálogo<textarea name="descripcion" rows="3"></textarea></label>
    <label>Foto 1 · La pieza sola<input type="file" name="archivo" accept="image/jpeg,image/png,image/webp"></label>
    <label>…o dirección (URL) de la foto 1<input type="text" name="foto" inputmode="url" placeholder="https://…"></label>
    <label>Foto 2 · La pieza puesta<input type="file" name="archivo_modelo" accept="image/jpeg,image/png,image/webp"></label>
    <label>…o dirección (URL) de la foto 2<input type="text" name="foto_modelo" inputmode="url" placeholder="https://…"></label>
    <p class="completo tenue">Tamaño ideal: cuadrada, 1600 × 1600 px, en JPG.</p>`;
}
$$('[data-campos-joya]').forEach(c => { c.innerHTML = plantillaCamposJoya(); });
// Una joya nueva no puede nacer reservada: se reserva desde el inventario
$('#form-agregar [name="estado"] option[value="Reservada"]').remove();

/* Reduce la foto a máximo 1600 px y la convierte a JPG antes de subirla */
async function prepararImagen(archivo) {
  let mapa;
  try {
    mapa = await createImageBitmap(archivo);
  } catch {
    throw new Error('No se pudo leer la imagen. Use un archivo JPG, PNG o WEBP.');
  }
  const escala = Math.min(1, 1600 / Math.max(mapa.width, mapa.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(mapa.width * escala);
  lienzo.height = Math.round(mapa.height * escala);
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(mapa, 0, 0, lienzo.width, lienzo.height);
  return new Promise((ok, mal) => lienzo.toBlob(
    b => (b ? ok(b) : mal(new Error('No se pudo procesar la imagen.'))), 'image/jpeg', 0.86));
}

async function subirFoto(archivo) {
  const imagen = await prepararImagen(archivo);
  const nombre = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await db.storage.from('joyas').upload(nombre, imagen, { contentType: 'image/jpeg' });
  if (error) throw new Error('No se pudo subir la imagen: ' + error.message);
  return db.storage.from('joyas').getPublicUrl(nombre).data.publicUrl;
}

function leerJoya(f) {
  const c = f.elements;
  return {
    nombre: c.nombre.value.trim(),
    precio: parseFloat(c.precio.value),
    tipo: c.tipo.value,
    estado: c.estado.value,
    joyero: c.joyero.value,
    peso: c.peso.value === '' ? 0 : parseFloat(c.peso.value),
    talla: c.talla.value.trim(),
    color: c.color.value.trim(),
    descripcion: c.descripcion.value.trim(),
    foto: c.foto.value.trim(),
    foto_modelo: c.foto_modelo.value.trim()
  };
}

/* Sube los archivos elegidos y devuelve las direcciones nuevas */
async function subirFotos(f) {
  const nuevas = {};
  const pieza = f.elements.archivo.files[0];
  const puesta = f.elements.archivo_modelo.files[0];
  if (pieza) nuevas.foto = await subirFoto(pieza);
  if (puesta) nuevas.foto_modelo = await subirFoto(puesta);
  return nuevas;
}

function hoy() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
const fechaCorta = f => (f ? String(f).slice(0, 10).split('-').reverse().join('/') : '—');

$('#form-agregar').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  ocupado(f, async () => {
    const joya = leerJoya(f);
    Object.assign(joya, await subirFotos(f));
    joya.comprador = '';
    joya.fecha_creacion = new Date().toISOString();
    await guardar(db.from('joyas').insert([joya]));
    f.reset();
    avisar('Joya guardada.');
    await recargar();
    cambiarVista('inventario');
  });
});

/* ---------- Reparto de ingresos ---------- */
$$('[data-reparto]').forEach(caja => {
  caja.innerHTML = `
    <p class="reparto-titulo">Distribución del ingreso</p>
    <label>Joyero %<input type="number" name="dj" min="0" max="100" step="any"></label>
    <label>Taller %<input type="number" name="dt" min="0" max="100" step="any"></label>
    <label>Formación %<input type="number" name="df" min="0" max="100" step="any"></label>
    <p class="suma" aria-live="polite"></p>`;
  caja.addEventListener('input', () => { caja.dataset.tocado = '1'; sumarReparto(caja); });
});

function ponerReparto(caja, valores) {
  $$('input', caja).forEach((i, n) => { i.value = Number.isFinite(valores[n]) ? valores[n] : 0; });
  delete caja.dataset.tocado;
  sumarReparto(caja);
}

function leerReparto(caja) {
  const v = $$('input', caja).map(i => parseFloat(i.value) || 0);
  const suma = v[0] + v[1] + v[2];
  return { texto: v.map(x => `${x}%`).join('/'), suma, valida: Math.abs(suma - 100) < 0.001 };
}

function sumarReparto(caja) {
  const { suma, valida } = leerReparto(caja);
  const p = $('.suma', caja);
  p.textContent = `Suma: ${numero(suma)}%`;
  p.classList.toggle('mal', !valida);
}

/* ---------- Venta ---------- */
function abrirVenta(id) {
  enVenta = datos.joyas.find(j => String(j.id) === id);
  if (!enVenta) return;
  const f = $('#form-venta');
  f.reset();
  $('#venta-titulo').textContent = `Vender: ${enVenta.nombre}`;
  $('#venta-precio').textContent = dinero(enVenta.precio);
  if (enVenta.estado === 'Reservada') f.elements.comprador.value = enVenta.comprador ?? '';
  ponerReparto($('[data-reparto]', f), DISTRIBUCION_BASE);
  $('#d-venta').showModal();
}

$('#form-venta').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  ocupado(f, async () => {
    const comprador = f.elements.comprador.value.trim();
    const reparto = leerReparto($('[data-reparto]', f));
    if (!comprador) return avisar('Escriba el nombre del comprador.', 'error');
    if (!reparto.valida) return avisar('La distribución debe sumar 100%.', 'error');
    await guardar(db.from('joyas').update({
      estado: 'Vendido',
      comprador,
      fecha_venta: new Date().toISOString(),
      joyero_distribucion: reparto.texto
    }).eq('id', enVenta.id).eq('estado', enVenta.estado));   // evita vender dos veces
    $('#d-venta').close();
    avisar('Venta registrada.');
    await recargar();
  });
});

/* ---------- Reservas ---------- */
let enReserva = null;

function abrirReserva(id) {
  enReserva = datos.joyas.find(j => String(j.id) === id);
  if (!enReserva) return;
  const f = $('#form-reserva');
  f.reset();
  f.elements.fecha.value = hoy();
  $('#reserva-titulo').textContent = `Reservar: ${enReserva.nombre}`;
  $('#reserva-precio').textContent = dinero(enReserva.precio);
  $('#d-reserva').showModal();
}

$('#form-reserva').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  ocupado(f, async () => {
    const comprador = f.elements.comprador.value.trim();
    if (!comprador) return avisar('Escriba quién se llevó la pieza.', 'error');
    await guardar(db.from('joyas').update({
      estado: 'Reservada', comprador, fecha_reserva: f.elements.fecha.value
    }).eq('id', enReserva.id).eq('estado', 'Catálogo'));
    $('#d-reserva').close();
    avisar('Pieza reservada.');
    await recargar();
  });
});

async function devolver(boton) {
  const joya = datos.joyas.find(j => String(j.id) === boton.dataset.devolver);
  if (!joya || !confirm(`¿"${joya.nombre}" fue devuelta por ${joya.comprador || 'la persona'}? Volverá al catálogo y se borrará la reserva.`)) return;
  boton.disabled = true;
  try {
    await guardar(db.from('joyas').update({ estado: 'Catálogo', comprador: '', fecha_reserva: null })
      .eq('id', joya.id).eq('estado', 'Reservada'));
    avisar('La pieza volvió al catálogo.');
    await recargar();
  } catch (error) {
    avisar(error.message, 'error');
    boton.disabled = false;
  }
}

/* ---------- Edición de joya ---------- */
function abrirJoya(id) {
  enEdicion = datos.joyas.find(j => String(j.id) === id);
  if (!enEdicion) return;
  const f = $('#form-editar');
  f.reset();
  const c = f.elements;
  ['nombre', 'precio', 'peso', 'talla', 'color', 'descripcion', 'foto', 'foto_modelo', 'comprador']
    .forEach(n => { c[n].value = enEdicion[n] ?? ''; });
  ['tipo', 'estado', 'joyero'].forEach(n => elegir(c[n], enEdicion[n]));
  ponerReparto($('[data-reparto]', f), leerDistribucion(enEdicion));
  c.fecha_reserva.value = String(enEdicion.fecha_reserva ?? '').slice(0, 10);
  camposSegunEstado(f);
  f.dataset.inicial = JSON.stringify(leerJoyaEditada(f));
  $('#d-joya').showModal();
}

function leerJoyaEditada(f) {
  return { ...leerJoya(f), comprador: f.elements.comprador.value.trim() };
}

function camposSegunEstado(f) {
  const { value } = f.elements.estado;
  $('[data-reparto]', f).hidden = value !== 'Vendido';
  $('#campo-fecha-reserva').hidden = value !== 'Reservada';
  if (value === 'Reservada' && !f.elements.fecha_reserva.value) f.elements.fecha_reserva.value = hoy();
}

$('#form-editar').elements.estado.addEventListener('change', e => camposSegunEstado(e.target.form));

$('#form-editar').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  ocupado(f, async () => {
    const antes = JSON.parse(f.dataset.inicial);
    const ahora = leerJoyaEditada(f);
    // Solo se envían los campos que la persona cambió
    const cambios = {};
    Object.keys(ahora).forEach(k => { if (!Object.is(ahora[k], antes[k])) cambios[k] = ahora[k]; });

    const caja = $('[data-reparto]', f);
    const pasaAVendida = ahora.estado === 'Vendido' && enEdicion.estado !== 'Vendido';
    if (ahora.estado === 'Vendido' && (caja.dataset.tocado || pasaAVendida)) {
      const reparto = leerReparto(caja);
      if (!reparto.valida) return avisar('La distribución debe sumar 100%.', 'error');
      cambios.joyero_distribucion = reparto.texto;
    }
    if (ahora.estado === 'Reservada') {
      if (!ahora.comprador) return avisar('Escriba quién tiene la pieza reservada.', 'error');
      const fecha = f.elements.fecha_reserva.value || hoy();
      if (fecha !== String(enEdicion.fecha_reserva ?? '').slice(0, 10)) cambios.fecha_reserva = fecha;
    }
    if (enEdicion.estado === 'Reservada' && ahora.estado === 'Catálogo') {
      Object.assign(cambios, { comprador: '', fecha_reserva: null });
    }
    if (enEdicion.estado === 'Reservada' && pasaAVendida) {
      if (!ahora.comprador) return avisar('Escriba el nombre del comprador.', 'error');
      cambios.fecha_venta = new Date().toISOString();
    }
    Object.assign(cambios, await subirFotos(f));

    if (Object.keys(cambios).length) {
      await guardar(db.from('joyas').update(cambios).eq('id', enEdicion.id));
      avisar('Cambios guardados.');
      await recargar();
    }
    $('#d-joya').close();
  });
});

$('#eliminar-joya').addEventListener('click', () => {
  if (!confirm(`¿Eliminar la joya "${enEdicion.nombre}"? Esta acción no se puede deshacer.`)) return;
  ocupado($('#form-editar'), async () => {
    await guardar(db.from('joyas').delete().eq('id', enEdicion.id));
    $('#d-joya').close();
    avisar('Joya eliminada.');
    await recargar();
  });
});

/* ---------- Egresos ---------- */
function abrirEgreso(id) {
  egresoActual = id ? datos.egresos.find(x => String(x.id) === id) : null;
  const f = $('#form-egreso');
  f.reset();
  if (egresoActual) {
    f.elements.concepto.value = egresoActual.concepto ?? '';
    f.elements.monto.value = egresoActual.monto ?? '';
    elegir(f.elements.categoria, egresoActual.categoria);
    f.elements.nombre_joyero.value = egresoActual.nombre_joyero ?? '';
  }
  $('#egreso-titulo').textContent = egresoActual ? 'Editar egreso' : 'Agregar egreso';
  $('#eliminar-egreso').hidden = !egresoActual;
  campoJoyero();
  $('#d-egreso').showModal();
}

function campoJoyero() {
  const f = $('#form-egreso');
  const es = f.elements.categoria.value === 'joyero';
  $('#campo-egreso-joyero').hidden = !es;
  f.elements.nombre_joyero.required = es;
}
$('#form-egreso').elements.categoria.addEventListener('change', campoJoyero);
$('#nuevo-egreso').addEventListener('click', () => abrirEgreso());

$('#form-egreso').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  ocupado(f, async () => {
    const c = f.elements;
    const egreso = {
      concepto: c.concepto.value.trim(),
      monto: parseFloat(c.monto.value),
      categoria: c.categoria.value,
      nombre_joyero: c.categoria.value === 'joyero' ? c.nombre_joyero.value.trim() || null : null
    };
    await guardar(egresoActual
      ? db.from('egreso').update(egreso).eq('id', egresoActual.id)
      : db.from('egreso').insert([egreso]));
    $('#d-egreso').close();
    avisar('Egreso guardado.');
    await recargar();
  });
});

$('#eliminar-egreso').addEventListener('click', () => {
  if (!confirm(`¿Eliminar el egreso "${egresoActual.concepto}"? Esta acción no se puede deshacer.`)) return;
  ocupado($('#form-egreso'), async () => {
    await guardar(db.from('egreso').delete().eq('id', egresoActual.id));
    $('#d-egreso').close();
    avisar('Egreso eliminado.');
    await recargar();
  });
});

/* ---------- Vistas ---------- */
const TEXTO_LIBRE = ['comprador', 'nombre', 'concepto', 'nombre_joyero'];

function filtrar(lista, idBarra) {
  const filtros = $$(`#${idBarra} [data-f]`).filter(c => c.value);
  return lista.filter(fila => filtros.every(c => {
    const campo = c.dataset.f;
    return c.type === 'search' && TEXTO_LIBRE.includes(campo)
      ? String(fila[campo] || '').toLowerCase().includes(c.value.trim().toLowerCase())
      : fila[campo] === c.value;
  }));
}

const filaVacia = (n, texto) => `<tr><td colspan="${n}" class="vacio">${esc(texto)}</td></tr>`;
const etiqueta = estado => `<span class="etiqueta e-${esc(CLAVE_ESTADO[estado] || 'otro')}">${esc(estado)}</span>`;
const botonEditar = id => `<button type="button" class="enlace" data-editar="${esc(id)}">Editar</button>`;
const cifra = (titulo, valor, detalle = '', clase = '') =>
  `<div class="cifra ${clase}"><p>${esc(titulo)}</p><strong>${valor}</strong>${detalle}</div>`;
const signo = v => (v < 0 ? 'mal' : 'bien');
const CATEGORIAS = [['joyero', 'Joyero'], ['taller', 'Taller'], ['formacion', 'Formación']];

function pintarInventario() {
  const lista = filtrar(datos.joyas, 'fi-inventario');
  $('#inventario').innerHTML = lista.map(j => {
    const url = urlSegura(j.foto);
    return `
    <article class="pieza">
      <div class="pieza-foto">${url
        ? `<img data-foto loading="lazy" src="${esc(url)}" alt="${esc(j.nombre)}">`
        : '<img class="sin-foto" src="assets/img/mariposa.webp" alt="Sin fotografía">'}</div>
      <div class="pieza-datos">
        <p class="pieza-tipo">${esc(nombreTipo(j.tipo))} ${etiqueta(j.estado)}</p>
        <h3>${esc(j.nombre)}</h3>
        <p class="tenue">Joyero: ${esc(j.joyero || '—')}</p>
        ${j.estado === 'Reservada' ? `<p class="tenue">La tiene: ${esc(j.comprador || '—')}</p>` : ''}
        ${j.estado === 'Catálogo' && !j.foto_modelo ? '<p class="tenue">Falta la foto puesta</p>' : ''}
        <p class="precio">${dinero(j.precio)}</p>
        <div class="acciones">
          <button type="button" class="boton boton-linea boton-chico" data-editar="${esc(j.id)}">Editar</button>
          ${j.estado === 'Catálogo' ? `<button type="button" class="boton boton-linea boton-chico" data-reservar="${esc(j.id)}">Reservar</button>
          <button type="button" class="boton boton-chico" data-vender="${esc(j.id)}">Vender</button>` : ''}
          ${j.estado === 'Reservada' ? botonesReserva(j.id) : ''}
        </div>
      </div>
    </article>`;
  }).join('') || '<p class="vacio">No hay joyas para mostrar.</p>';
}

const botonesReserva = id => `
  <button type="button" class="boton boton-chico" data-vender="${esc(id)}">Registrar venta</button>
  <button type="button" class="boton boton-linea boton-chico" data-devolver="${esc(id)}">Devolver al catálogo</button>`;

function pintarReservas() {
  const lista = datos.joyas.filter(j => j.estado === 'Reservada')
    .sort((a, b) => String(a.fecha_reserva ?? '').localeCompare(String(b.fecha_reserva ?? '')));
  const valor = lista.reduce((s, j) => s + (Number(j.precio) || 0), 0);
  $('#resumen-reservas').innerHTML =
    cifra('Piezas reservadas', lista.length) + cifra('Valor de las piezas reservadas', dinero(valor));
  $('#t-reservas').innerHTML = lista.map(j => `
    <tr><td>${esc(j.nombre)}</td><td>${esc(j.joyero || '—')}</td><td>${esc(j.comprador || '—')}</td>
    <td>${fechaCorta(j.fecha_reserva)}</td><td class="n">${dinero(j.precio)}</td>
    <td><div class="acciones en-tabla">${botonesReserva(j.id)} ${botonEditar(j.id)}</div></td></tr>`).join('')
    || filaVacia(6, 'No hay piezas reservadas.');
}

function pintarHistorial() {
  $('#t-historial').innerHTML = filtrar(datos.joyas, 'fi-historial').map(j => `
    <tr><td>${esc(j.nombre)}</td><td>${esc(nombreTipo(j.tipo))}</td><td>${esc(j.joyero)}</td>
    <td class="n">${dinero(j.precio)}</td><td>${etiqueta(j.estado)}</td>
    <td>${esc(j.comprador || '—')}</td><td>${botonEditar(j.id)}</td></tr>`).join('')
    || filaVacia(7, 'No hay joyas registradas.');
}

const ventas = () => datos.joyas.filter(j => ESTADOS_INGRESO.includes(j.estado));

function pintarIngresos() {
  const ing = calcularIngresos(ventas());
  const egr = calcularEgresos(datos.egresos);
  $('#resumen-ingresos').innerHTML = CATEGORIAS.map(([k, t]) => cifra(t, dinero(ing[k]),
    `<small>Egresos: ${dinero(egr[k])}</small><small class="${signo(ing[k] - egr[k])}">Balance: ${dinero(ing[k] - egr[k])}</small>`)).join('');
  $('#t-ingresos').innerHTML = filtrar(ventas(), 'fi-ingresos').map(j => {
    const d = leerDistribucion(j);
    const parte = n => dinero((Number(j.precio) || 0) * (d[n] || 0) / 100);
    return `<tr><td>${esc(j.nombre)}</td><td>${esc(j.comprador || '—')}</td><td>${esc(j.joyero || 'Sin asignar')}</td>
      <td class="n">${dinero(j.precio)}</td><td class="n">${parte(0)}</td><td class="n">${parte(1)}</td><td class="n">${parte(2)}</td>
      <td>${d.map(x => `${numero(x)}%`).join(' / ')}</td><td>${botonEditar(j.id)}</td></tr>`;
  }).join('') || filaVacia(9, 'No hay ingresos registrados.');
}

function pintarEgresos() {
  const egr = calcularEgresos(datos.egresos);
  $('#resumen-egresos').innerHTML = CATEGORIAS.map(([k, t]) => cifra(t, dinero(egr[k]))).join('');
  const porJoyero = [...balancePorJoyero([], datos.egresos)];
  $('#egresos-joyero').innerHTML = porJoyero.length
    ? `<h2>Por joyero</h2><ul class="fichas">${porJoyero.map(([n, d]) => `<li>${esc(n)} <strong>${dinero(d.egresos)}</strong></li>`).join('')}</ul>`
    : '';
  $('#t-egresos').innerHTML = filtrar(datos.egresos, 'fi-egresos').map(x => `
    <tr><td>${esc(x.concepto)}</td><td>${esc(Object.fromEntries(CATEGORIAS)[x.categoria] || x.categoria)}</td>
    <td>${esc(x.nombre_joyero || '—')}</td><td class="n">${dinero(x.monto)}</td>
    <td><button type="button" class="enlace" data-egreso="${esc(x.id)}">Editar</button></td></tr>`).join('')
    || filaVacia(5, 'No hay egresos registrados.');
}

function pintarBalance() {
  const ing = calcularIngresos(ventas());
  const egr = calcularEgresos(datos.egresos);
  const suma = o => o.joyero + o.taller + o.formacion;
  const neto = suma(ing) - suma(egr);
  $('#balance-total').innerHTML =
    cifra('Total ingresos', dinero(suma(ing))) + cifra('Total egresos', dinero(suma(egr))) +
    cifra('Balance neto', dinero(neto), '', signo(neto));
  $('#balance-categorias').innerHTML = CATEGORIAS.map(([k, t]) => cifra(t, dinero(ing[k] - egr[k]),
    `<small>Ingresos: ${dinero(ing[k])}</small><small>Egresos: ${dinero(egr[k])}</small>`, signo(ing[k] - egr[k]))).join('');
  const s = calcularEstadisticas(datos.joyas);
  $('#balance-estados').innerHTML = [
    ['En catálogo', s.catalogo], ['Reservadas', s.reservadas], ['Vendidas', s.vendidas], ['En alquiler', s.alquiler], ['Donadas', s.donacion],
    ['Servicios', s.servicio], ['Patrocinios', s.patrocinio], ['Total', s.total]
  ].map(([t, v]) => cifra(t, v)).join('');
  $('#balance-tipos').innerHTML = Object.entries(s.tiposVendidos)
    .map(([k, v]) => cifra(nombreTipo(k), v)).join('');
  pintarJoyeros();
}

function pintarJoyeros() {
  graficas.forEach(g => g.destroy());
  graficas = [];
  const lista = [...balancePorJoyero(datos.joyas, datos.egresos)];
  $('#balance-joyeros').innerHTML = lista.map(([nombre, d], i) => `
    <article class="tarjeta">
      <h3>${esc(nombre)}</h3>
      <dl>
        <div><dt>Ingresos</dt><dd>${dinero(d.ingresos)}</dd></div>
        <div><dt>Egresos</dt><dd>${dinero(d.egresos)}</dd></div>
        <div><dt>Balance</dt><dd class="${signo(d.ingresos - d.egresos)}">${dinero(d.ingresos - d.egresos)}</dd></div>
        <div><dt>Piezas creadas</dt><dd>${d.total}</dd></div>
      </dl>
      <div class="grafica"><canvas id="g-estados-${i}" role="img" aria-label="Piezas por estado"></canvas></div>
      <p class="tenue">${Object.entries(d.tipos).filter(([, n]) => n).map(([t, n]) => `${esc(nombreTipo(t))}: ${n}`).join(' · ') || 'Sin tipos registrados'}</p>
    </article>`).join('') || '<p class="vacio">No hay movimientos por joyero.</p>';

  lista.forEach(([, d], i) => {
    const e = d.estados;
    graficas.push(new Chart($(`#g-estados-${i}`), {
      type: 'bar',
      data: {
        labels: ['Vendidas', 'Servicios', 'Patrocinios', 'Donadas', 'Alquiler', 'Catálogo', 'Reservadas'],
        datasets: [{
          data: [e.vendidas, e.servicio, e.patrocinio, e.donacion, e.alquiler, e.catalogo, e.reservadas],
          backgroundColor: '#8c4a2a', borderRadius: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 }, grid: { display: false } },
          x: { ticks: { font: { size: 9 }, maxRotation: 45 }, grid: { display: false } }
        }
      }
    }));
  });
}

/* ---------- Autores ---------- */
function pintarAutores() {
  $('#lista-autores').innerHTML = datos.autores.map(a => `
    <form class="tarjeta" data-autor-form="${esc(a.nombre)}">
      <h3>${esc(a.nombre)}</h3>
      <label>Cómo se muestra<input type="text" name="nombre_visible" value="${esc(a.nombre_visible)}" placeholder="${esc(a.nombre)}"></label>
      <label>Descripción pública<textarea name="descripcion" rows="4" maxlength="400" placeholder="Qué significa su palabra, qué le gusta crear…">${esc(a.descripcion)}</textarea></label>
      <label class="casilla"><input type="checkbox" name="visible" ${a.visible ? 'checked' : ''}> Mostrar en el catálogo</label>
      <button type="submit" class="boton boton-chico">Guardar</button>
    </form>`).join('') || '<p class="vacio">No hay autores. Ejecute el script SQL.</p>';
}

$('#lista-autores').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  ocupado(f, async () => {
    const cambios = {
      nombre_visible: f.elements.nombre_visible.value.trim() || null,
      descripcion: f.elements.descripcion.value.trim() || null,
      visible: f.elements.visible.checked
    };
    const fila = await guardar(db.from('autores').update(cambios).eq('nombre', f.dataset.autorForm));
    Object.assign(datos.autores.find(a => a.nombre === fila.nombre), fila);
    avisar('Autor actualizado.');
  });
});

$('#form-autor-nuevo').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  ocupado(f, async () => {
    const nombre = f.elements.nombre.value.trim();
    if (!nombre) return;
    await guardar(db.from('autores').insert([{ nombre }]));
    f.reset();
    avisar('Autor agregado.');
    await recargar();
  });
});

/* ---------- Copias en CSV ---------- */
function descargarCSV(nombre, filas) {
  if (!filas.length) return avisar('No hay datos para descargar.', 'error');
  const columnas = [...new Set(filas.flatMap(Object.keys))];
  const celda = v => {
    let t = v === null || v === undefined ? '' : String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(t)) t = "'" + t;  // evita fórmulas en Excel
    return `"${t.replace(/"/g, '""')}"`;
  };
  const texto = [columnas, ...filas.map(f => columnas.map(c => f[c]))]
    .map(fila => fila.map(celda).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' }));
  a.download = `${nombre}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('#csv-joyas').addEventListener('click', () => descargarCSV('joyas', datos.joyas));
$('#csv-egresos').addEventListener('click', () => descargarCSV('egresos', datos.egresos));

/* ---------- Navegación ---------- */
const PINTORES = {
  inventario: pintarInventario, agregar: () => {}, reservas: pintarReservas, historial: pintarHistorial,
  ingresos: pintarIngresos, egresos: pintarEgresos, balance: pintarBalance, autores: pintarAutores
};

function pintar() {
  $$('.vista').forEach(v => { v.hidden = v.id !== `v-${vista}`; });
  $$('#pestanas button').forEach(b => b.setAttribute('aria-pressed', b.dataset.vista === vista));
  PINTORES[vista]();
}

function cambiarVista(nueva) {
  vista = nueva;
  pintar();
}

document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.vista) cambiarVista(b.dataset.vista);
  else if (b.dataset.editar) abrirJoya(b.dataset.editar);
  else if (b.dataset.vender) abrirVenta(b.dataset.vender);
  else if (b.dataset.reservar) abrirReserva(b.dataset.reservar);
  else if (b.dataset.devolver) devolver(b);
  else if (b.dataset.egreso) abrirEgreso(b.dataset.egreso);
  else if (b.dataset.limpiar !== undefined) {
    $$('[data-f]', b.closest('.barra')).forEach(c => { c.value = ''; });
    pintar();
  }
});
$$('.barra[id^="fi-"]').forEach(barra => barra.addEventListener('input', pintar));

db.auth.onAuthStateChange(evento => {
  if (evento === 'SIGNED_OUT' && !$('#panel').hidden) mostrarAcceso('La sesión terminó.');
});

entrarSiEsAdmin();
