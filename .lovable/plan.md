**Diagnóstico**

La app publicada está usando actualmente este backend en `.env`:

- `https://srznzxyhaomvzwqgaego.supabase.co`
- Project ID/ref: `srznzxyhaomvzwqgaego`

Pero tú confirmas que el Project ID correcto es:

- `oqkgofqwgurvhzluuvsm`

Por eso Google muestra `Error 400: redirect_uri_mismatch`: el login está iniciando OAuth contra un proyecto/callback distinto al que configuraste en Google.

**Plan de corrección**

1. Actualizar la configuración local de la app para apuntar al proyecto correcto `oqkgofqwgurvhzluuvsm`.
2. Revertir los call sites de Google OAuth para usar el flujo administrado de Lovable Cloud (`lovable.auth.signInWithOAuth`) en vez de llamar directo a `supabase.auth.signInWithOAuth`, porque ese flujo maneja mejor custom domains y callbacks publicados.
3. Verificar que no queden referencias al project ref incorrecto `srznzxyhaomvzwqgaego` en los archivos de app modificables.
4. Publicar/probar de nuevo en `https://findable.work`.

**Config que debes tener en Google Cloud después del cambio**

En el OAuth Client correcto, bajo **Authorized redirect URIs**, debe estar exactamente:

```text
https://oqkgofqwgurvhzluuvsm.supabase.co/auth/v1/callback
```

Y bajo **Authorized JavaScript origins**:

```text
https://findable.work
https://www.findable.work
https://findable-work.lovable.app
```

**Nota importante**

La causa principal aquí no es tu cambio en Google; es que la app quedó mezclando dos backends distintos. El siguiente paso es alinear el código/config con `oqkgofqwgurvhzluuvsm` y quitar esa mezcla.