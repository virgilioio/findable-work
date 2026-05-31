**Diagnóstico**

Ya entra OAuth de Google, pero al volver a `/` no se navega a `/app`. Encontré tres puntos frágiles:

1. **En el sitio publicado** (no iframe), el broker hace un redirect completo y devuelve los tokens en el URL. El control NO regresa al código que llamó `signInWithOAuth`, así que el `runClaim`/`redirectToApp` posteriores en `auth-dialog.tsx` y `login.tsx` nunca corren en ese flujo.
2. El listener de `/` que sí cubre ese caso (`handleSignedIn` en `src/routes/index.tsx`) depende de que `SIGNED_IN` se dispare **después** de que `hydrated` sea `true`. Hay una condición de carrera: si Supabase procesa los tokens del URL antes de que el efecto se suscriba, el evento se pierde.
3. Si no hay conversación de invitado (caso de la prueba — el usuario abrió el diálogo sin escribir nada), `runClaim` se llama igual con `messages: []` y puede fallar silenciosamente sin navegar.

**Plan de corrección**

1. Hacer el handler post-OAuth de `/` resiliente:
   - Quitar la dependencia de `hydrated`: suscribirse al `onAuthStateChange` inmediatamente (en un effect sin deps) y también re-chequear `getUser()` después de hidratación, para que ningún evento se pierda.
   - Si `data.user` ya existe en el primer poll, navegar sin esperar.
2. En `AuthDialog.onGoogle`: si `result.redirected` es falso y SÍ hay sesión pero NO hay mensajes para reclamar, navegar directo a `/app` en vez de llamar `runClaim` con conversación vacía.
3. En `login.tsx`: igual — si el broker devolvió tokens en el mismo tick, llamar `redirectToApp` además de confiar en el listener.
4. Limpiar los tokens del URL después de procesarlos (`history.replaceState`) para que un refresh no re-dispare lógica.

**Notas técnicas**

- Supabase está creado con `detectSessionInUrl` por defecto (`true`), así que los tokens del hash se procesan automáticamente — solo hay que asegurarse de estar escuchando cuando eso pasa.
- No tocaremos los archivos auto-generados (`src/integrations/supabase/*`, `src/integrations/lovable/*`).

¿Procedo?