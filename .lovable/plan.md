## Objetivo

Bajar las señales que disparan el clasificador de "social engineering" de Safe Browsing en las páginas públicas de aplicación (`/jobs/$slug`), **sin cambiar la marca, los colores, ni la estructura visual** del sitio. Solo metadata, microcopy textual y un footer legal mínimo.

## Cambios

### 1. Metadata invisible en `/jobs/$slug` (sin cambios visibles)

Archivo: `src/routes/jobs/$slug.tsx` (función `head()`).

- `title`: incluir empresa contratante de forma más prominente → `"{title} at {company} — Apply via findable"`. Si no hay company, fallback al actual.
- `description`: si hay company, anteponer `"Apply to {title} at {company}. "` + summary. Esto le dice al crawler "esta página representa a una empresa real conocida", no a un dominio genérico.
- Añadir `<meta name="robots" content="index, follow">` explícito.
- Añadir `<link rel="canonical">` a `https://findable.work/jobs/{slug}` (vía `links` en el leaf — el root no tiene canonical, así que no hay duplicado).
- Añadir JSON-LD `JobPosting` (schema.org) en `scripts`. Es el schema oficial para ofertas de empleo, y es **la señal más fuerte** para que Google clasifique la página como "job listing legítimo" en vez de "form que pide datos personales". Campos: `title`, `description`, `hiringOrganization` (con `name` = company), `jobLocation`, `employmentType`, `datePosted`, `baseSalary` cuando exista. Todo derivado de `loaderData.job`.

Cero cambios visuales.

### 2. Microcopy junto a Phone y al botón de submit

Archivo: `src/routes/jobs/$slug.tsx` (sin cambiar layout — solo añadir `<p>` debajo de los campos existentes).

- Debajo del campo **Phone**: texto pequeño `text-text-faint text-[11.5px]` →  
  *"Optional. Only used by the hiring team to contact you about this role."*
- Debajo del botón **Submit application**, en el mismo bloque del form: una línea fina centrada →  
  *"We never ask for passwords, payments, or ID documents. Your info is shared only with {company}."* (si no hay company → "with the hiring team").

Misma tipografía y tokens que ya usa el formulario (`text-text-faint`, `text-[11.5px]`). No añade secciones nuevas, no cambia el grid.

### 3. Footer legal mínimo en `/jobs/$slug`

Hoy la página no tiene footer (solo header). Añadir un footer **al final del `<div>` principal**, antes del `<HiringAssistant />`, con el mismo lenguaje visual que el resto:

```text
─────────────────────────────────────────────
Operated by findable · Privacy · Terms · findable.work
─────────────────────────────────────────────
```

- Usa `border-t border-border`, `text-[11.5px] text-text-faint`, `py-6`, links inline a `/privacy`, `/terms`, `https://findable.work`.
- Sin logos extra, sin secciones. Una sola línea centrada.
- Esto le da al crawler de Safe Browsing señales de "negocio identificable con política de privacidad accesible desde cada página de captura de datos" — uno de los criterios explícitos de su clasificador.

### 4. Después de desplegar: enviar revisión a Google

Una vez los 3 cambios estén en producción (URL pública `https://findable.work/jobs/<algún-slug-publicado>`), tú envías la revisión desde Search Console → Seguridad y acciones manuales → Solicitar revisión, con un mensaje del estilo:

> findable.work is a recruitment SaaS. The `/jobs/<slug>` pages are standard job application forms (name, email, optional phone, LinkedIn, CV). We have:
> - Added schema.org JobPosting structured data identifying the hiring company.
> - Added visible microcopy clarifying that we never request passwords, payments or ID documents.
> - Added a footer with links to Privacy, Terms, and our company site on every application page.
> No passwords, payments, downloads or executables are ever requested. Please re-review.

Yo te dejo el texto exacto listo para copiar cuando los cambios estén en main.

## Fuera de alcance

- No se toca el header, el form layout, los colores, ni el assistant.
- No se cambia el flujo de datos ni los endpoints.
- No se añade ninguna nueva ruta ni componente reutilizable más allá del footer inline.

## Archivos tocados

- `src/routes/jobs/$slug.tsx` — `head()` enriquecido + JSON-LD JobPosting + microcopy + footer inline.

Nada más.
