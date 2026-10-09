# CRUD de rutas

En `/dashboard/rutas`, el catálogo administra los recorridos de la tabla `routes`.
El botón «Nueva ruta del catálogo» crea un recorrido sin programar un viaje.
El botón existente «Crear Ruta» mantiene su flujo de contrato, pasajeros y servicio.

Solo un administrador activo puede crear, editar o eliminar. Las acciones del
servidor verifican la sesión y empresa; Supabase conserva las políticas RLS.
La eliminación actualiza `deleted_at` y desactiva la ruta, sin borrar servicios,
paradas ni pasajeros. Los códigos eliminados siguen reservados por la restricción
única existente. No requiere migraciones nuevas.

## Verificación manual con Supabase

1. Iniciar sesión con un administrador y abrir Gestión de Rutas.
2. Crear una ruta con código único, nombre, origen y destino.
3. Buscar por código y comprobar los filtros de activa/inactiva.
4. Editar nombre, duración, distancia y estado; recargar y comprobar persistencia.
5. Intentar repetir el código: debe aparecer un error sin crear otra ruta.
6. Intentar una duración negativa o fraccionaria: no debe guardarse.
7. Cancelar la confirmación de eliminación: la ruta debe seguir visible.
8. Confirmar eliminación: debe desaparecer incluso después de recargar; sus
   servicios deben conservarse. Reutilizar su código debe mostrar un error.
9. Con un conductor, comprobar que el catálogo es de solo lectura y que las
   acciones del servidor rechazan cambios.

Cambiar origen o destino limpia sus coordenadas anteriores. No modifica las
paradas de viajes existentes, que conservan su información operativa.
