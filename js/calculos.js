/* Reglas financieras. Son las mismas de la versión anterior. */
'use strict';

const ESTADOS_INGRESO = ['Vendido', 'Servicio', 'Patrocinio'];
const DISTRIBUCION_BASE = [35, 35, 30]; // joyero / taller / formación

function leerDistribucion(joya) {
  if (!joya.joyero_distribucion) return DISTRIBUCION_BASE.slice();
  return String(joya.joyero_distribucion).split('/').map(p => parseFloat(p));
}

function calcularIngresos(ventas) {
  const totales = { joyero: 0, taller: 0, formacion: 0 };
  ventas.forEach(joya => {
    const [j, t, f] = leerDistribucion(joya);
    const precio = Number(joya.precio) || 0;
    totales.joyero += (precio * (j || 0)) / 100;
    totales.taller += (precio * (t || 0)) / 100;
    totales.formacion += (precio * (f || 0)) / 100;
  });
  return totales;
}

function calcularEgresos(egresos) {
  const totales = { joyero: 0, taller: 0, formacion: 0 };
  egresos.forEach(e => {
    if (e.categoria in totales) totales[e.categoria] += Number(e.monto) || 0;
  });
  return totales;
}

function tiposEnCero() {
  return { arete: 0, anillo: 0, pulsera: 0, dije: 0, servicio: 0, patrocinio: 0 };
}

const CLAVE_ESTADO = {
  'Catálogo': 'catalogo', 'Reservada': 'reservadas', 'Vendido': 'vendidas', 'Alquiler': 'alquiler',
  'Donación': 'donacion', 'Servicio': 'servicio', 'Patrocinio': 'patrocinio'
};

function calcularEstadisticas(joyas) {
  const r = {
    catalogo: 0, reservadas: 0, vendidas: 0, alquiler: 0, donacion: 0, servicio: 0, patrocinio: 0,
    total: joyas.length, tiposVendidos: tiposEnCero()
  };
  joyas.forEach(joya => {
    const clave = CLAVE_ESTADO[joya.estado];
    if (clave) r[clave]++;
    if (ESTADOS_INGRESO.includes(joya.estado) && Object.hasOwn(r.tiposVendidos, joya.tipo)) {
      r.tiposVendidos[joya.tipo]++;
    }
  });
  return r;
}

function balancePorJoyero(joyas, egresos) {
  const mapa = new Map();
  const de = nombre => {
    if (!mapa.has(nombre)) {
      mapa.set(nombre, {
        ingresos: 0, egresos: 0, total: 0,
        estados: { catalogo: 0, reservadas: 0, vendidas: 0, alquiler: 0, donacion: 0, servicio: 0, patrocinio: 0 },
        tipos: tiposEnCero()
      });
    }
    return mapa.get(nombre);
  };
  joyas.forEach(joya => {
    if (!joya.joyero) return;
    const d = de(joya.joyero);
    d.total++;
    const clave = CLAVE_ESTADO[joya.estado];
    if (clave) d.estados[clave]++;
    if (Object.hasOwn(d.tipos, joya.tipo)) d.tipos[joya.tipo]++;
    if (ESTADOS_INGRESO.includes(joya.estado)) {
      d.ingresos += ((Number(joya.precio) || 0) * (leerDistribucion(joya)[0] || 0)) / 100;
    }
  });
  egresos.forEach(e => {
    if (e.categoria === 'joyero' && e.nombre_joyero) {
      de(e.nombre_joyero).egresos += Number(e.monto) || 0;
    }
  });
  return mapa;
}

if (typeof module !== 'undefined') {
  module.exports = { calcularIngresos, calcularEgresos, calcularEstadisticas, balancePorJoyero };
}
