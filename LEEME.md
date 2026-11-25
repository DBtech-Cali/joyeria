# Amathea · Catálogo y gestión del taller

- `index.html`: catálogo público.
- `admin.html`: gestión del taller (correo y contraseña de Supabase).
- `supabase/seguridad_y_catalogo.sql`: seguridad y novedades de la base de datos.

## Puesta en marcha (en este orden)

El SQL hace que la página anterior deje de funcionar. Haga los pasos 2 y 3 seguidos.

1. **Copia de seguridad.** En Supabase > Table Editor, exporte `joyas` y `egreso` a CSV.
   En su repositorio de GitHub, descargue también una copia del proyecto actual.
2. **SQL.** Abra `supabase/seguridad_y_catalogo.sql`, reemplace `PEGA_AQUI_EL_UID`
   por el UID del administrador (Authentication > Users) y ejecútelo completo en SQL Editor.
3. **Publicar.** Descomprima el ZIP y suba su contenido a la raíz del repositorio
   (Add file > Upload files), conservando las carpetas. El nuevo `index.html` reemplaza al anterior.
4. **Probar** (espere unos minutos a que GitHub Pages publique y recargue con Ctrl + F5):
   - El catálogo carga sin iniciar sesión.
   - Ingresa en `admin.html` con su correo y contraseña.
   - Los totales de **Balance** coinciden con los que tenía antes.
   - Puede agregar una joya de prueba con foto, editarla y eliminarla.
5. **Revisar.** En Advisors > Security Advisor, actualice el análisis.

## Completar contenidos

- **Autores:** pestaña Autores. La información es pública: sin nombres reales, edades,
  lugares de origen, hechos de su historia ni fotografías que permitan identificarlos.
- **Piezas:** edite cada joya para agregar talla, descripción y las dos fotos.

## Fotografías

- Foto 1, la pieza sola; foto 2, la pieza puesta.
- Ideal: cuadrada (1:1), 1600 × 1600 px. Mínimo: 1200 × 1200 px.
- JPG, PNG o WEBP (no HEIC). La página reduce y comprime la imagen al subirla.
- Pieza centrada, ocupando cerca del 70 % del encuadre; luz suave y fondo liso oscuro.

## Reservas

En **Inventario**, use **Reservar** cuando la persona se lleva la pieza sin terminar de pagar.
Sale del catálogo y no cuenta como ingreso. En **Reservas** puede **Registrar venta**
(cuando complete el pago) o **Devolver al catálogo**.

## Cambios en la base de datos

No se modifican ni borran registros de joyas o egresos. Se agregan (si no existen) las
columnas `descripcion`, `talla`, `foto_modelo`, `fecha_reserva`, `fecha_venta` y
`joyero_distribucion`, la tabla `autores`,
la función `es_admin`, políticas de seguridad y un límite de 5 MB para fotos nuevas.

## Seguridad

- La clave `anon` de `js/config.js` es pública por diseño. Nunca agregue la `service_role`.
- La contraseña antigua sigue en el historial de Git: no la use en ningún otro servicio.
- Si cambia de proyecto de Supabase, actualice `js/config.js` y la dirección que aparece en
  la etiqueta `Content-Security-Policy` de los dos archivos HTML.

## Créditos

Logos y fotografías: catálogo Amathea, temporada 2025. Tipografía Arapey (licencia en
`assets/fonts`). Librerías incluidas: supabase-js y Chart.js (licencia MIT).
