## Lo que tiene que estar alineado para que “Continue with Google” funcione

1. **El dominio desde donde se inicia login debe coincidir con el dominio de retorno**
   - Si haces clic desde `https://findable.work`, el login debe iniciar con `redirect_uri: https://findable.work`.
   - Si haces clic desde `https://www.findable.work`, debe volver a `https://www.findable.work`.
   - Mezclar `findable.work`, `www.findable.work`, preview URLs y published URLs puede dejar la sesión en un origen distinto y parecer que “no pasó nada”.

2. **Google Auth debe estar habilitado en Lovable Cloud para este proyecto**
   - Si usas el Google OAuth administrado por Lovable Cloud, no debería requerir configuración manual en Google.
   - Si pusiste tus propias credenciales de Google, el Client ID/Secret y el redirect callback mostrado por Lovable Cloud deben coincidir exactamente en Google Cloud.

3. **El código debe usar solo el flujo OAuth administrado**
   - El botón debe llamar a `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })`.
   - No debe existir ningún `supabase.auth.signInWithOAuth()` para Google, porque eso dispara otro flujo distinto.
   - Esto ya parece estar alineado en `login.tsx` y `auth-dialog.tsx`.

4. **El callback de OAuth no debe ser interceptado por el frontend**
   - Las rutas especiales tipo `/~oauth/...` deben llegar a Lovable Cloud, no a la app React, caché, service worker, ni ruta local.
   - Si el navegador vuelve a `/` sin hash, sin query, sin consola y sin sesión, sospecharía primero de esta parte o de la configuración del proveedor.

5. **El cliente de auth no debe intentar procesar el callback por su cuenta**
   - El cliente actual todavía tiene `detectSessionInUrl` implícitamente activo porque no está configurado en `false`.
   - Eso puede competir con el broker OAuth administrado y producir errores como `failed to exchange authorization code`.
   - Importante: `src/integrations/supabase/client.ts` está marcado como autogenerado/no editar, así que no conviene parchearlo a ciegas; habría que corregirlo por la vía correcta o confirmar si el archivo fue manualmente alterado antes.

6. **Después del callback debe existir una sesión local válida**
   - Al volver de Google, la app debe poder leer `supabase.auth.getUser()` o recibir `SIGNED_IN` / `INITIAL_SESSION`.
   - Si no hay sesión, `/app` correctamente te rechaza y te manda a `/login`.
   - Borrar una cuenta de prueba no arregla esto si el problema está antes: en callback, sesión o dominio.

7. **La ruta de destino debe navegar después de sesión confirmada**
   - Si la sesión existe, `/` y `/login` deben redirigir a `/app`.
   - Si no existe sesión, no hay nada seguro que redirigir; navegar a `/app` solo produciría otro rebote a login.

8. **La app debe cargar correctamente antes de diagnosticar OAuth**
   - Hay un error de runtime en preview: `Failed to fetch dynamically imported module: virtual:tanstack-start-client-entry`.
   - Si ese error también aparece en el dominio publicado, la app puede no hidratar y por eso no habría logs ni reacción visual.
   - Esto se debe separar del problema OAuth: primero confirmar si `findable.work` carga JS correctamente en una ventana limpia.

## Lo que yo revisaría antes de tocar código otra vez

1. **Confirmar el recorrido exacto**
   - URL donde haces clic.
   - URL final después de seleccionar Google.
   - Si pasa por `/~oauth/initiate` o `/~oauth/callback`.
   - Si vuelve a `/`, `/login`, `/#error=...`, o simplemente queda igual.

2. **Leer network requests del intento de Google**
   - Buscar 3xx/4xx/5xx en `/~oauth`, `oauth.lovable.app`, `/auth/v1/token`, `/auth/v1/user`.
   - Esto dirá si el fallo es configuración del proveedor, callback, intercambio de código o sesión local.

3. **Confirmar sesión después del retorno**
   - En vez de asumir, revisar si `getUser()` devuelve usuario al volver de Google.
   - Si hay usuario y no navega: problema de routing.
   - Si no hay usuario: problema de OAuth/session exchange.

4. **Verificar configuración de Google Auth en Lovable Cloud**
   - Especialmente si cambiaste a credenciales propias de Google.
   - Confirmar que no quedó una configuración parcial o un callback equivocado.

5. **Solo después decidir el cambio mínimo**
   - Si el network muestra callback/config error: corregir Cloud/Google config, no código.
   - Si el callback vuelve con tokens pero la app no crea sesión: corregir manejo de sesión.
   - Si hay sesión pero no navega: corregir redirect local a `/app`.
   - Si la app no hidrata: arreglar el error de carga del bundle primero.

## Mi recomendación de siguiente paso

No añadiría más lógica todavía. Haría una pasada de diagnóstico con Network + estado de sesión en el dominio real, y con eso separaríamos el problema en una de estas tres categorías:

```text
A) Google/Cloud config falla antes de crear sesión
B) OAuth crea sesión, pero la app no la detecta
C) La app detecta sesión, pero el router no navega a /app
```

Con esa clasificación, el fix debería ser uno solo y pequeño, no otra capa más de código encima.