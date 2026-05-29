# Plan — Cleaner chat formatting + markdown rendering in Job / Job Posts

Two related problems:

1. Assistant chat messages feel cramped, and very long replies blob into walls of text.
2. AI-generated text in the **Job** tab (Summary) and **Job Posts** tab (post body) shows raw markdown like `# Heading` and `**bold**` — and the same raw markdown also appears on the public job page.

## 1. Chat message formatting

File: `src/routes/_authenticated/app.c.$id.tsx` (`MessageRow`, assistant branch).

- Loosen vertical rhythm so line skips actually breathe:
  - Bump base line-height (e.g. `leading-7`) on the prose container.
  - Increase paragraph spacing (`prose-p:my-3`), list spacing (`prose-ul:my-3 prose-ol:my-3 prose-li:my-1`), heading top margin (`prose-headings:mt-5 prose-headings:mb-2`).
  - Add small gap before/after lists and code blocks.
- Enable GFM so the model's `-`, `*`, `1.` and tables render as real lists/tables instead of inline text. Add `remark-gfm` to `<ReactMarkdown>` (`bun add remark-gfm`).
- Style fenced code (`prose-pre:bg-bg-bubble prose-pre:rounded-lg prose-pre:p-3 prose-code:bg-bg-bubble prose-code:px-1 prose-code:rounded`).

Prompt-side nudge (so long responses self-format) — update the chat assistant system prompt in the `prompts` table (slug `chat.main`) with one short rule:

> When a response is longer than ~4 sentences, structure it with short paragraphs separated by blank lines, and use bullet lists (`-`) or numbered lists for any enumeration of ≥3 items. Use `**bold**` for key terms sparingly. Avoid headings unless the response has multiple distinct sections.

No code changes for the prompt — just a migration/update through the prompts admin path.

## 2. Render markdown in Job tab + Job Posts tab + public job page

Currently three spots render AI markdown as plain text via `whitespace-pre-wrap`:

- `src/routes/_authenticated/app.c.$id.tsx` ~L929 — Job Summary (read mode).
- `src/components/job-posts/job-posts-panel.tsx` ~L351 — Job post body preview.
- `src/routes/jobs/$slug.tsx` ~L233 — public job page summary/description.

Approach: keep the **edit experience** unchanged (textarea with raw markdown — the user said they like seeing it), but render formatted markdown whenever we're in *read/preview* mode or publishing publicly.

Changes:

- Extract a small shared component `src/components/ui/markdown.tsx`:
  ```tsx
  <Markdown className="...">{text}</Markdown>
  ```
  Wraps `ReactMarkdown` with `remark-gfm` and the same prose token classes used in chat (themed via `prose-invert`, semantic tokens only).
- Job tab Summary read view: replace the `whitespace-pre-wrap` div with `<Markdown>`.
- Job Posts panel preview pane (the right-side preview at L351, NOT the editing textarea): replace `<p className="whitespace-pre-wrap">…</p>` with `<Markdown>`. The "Copy" action keeps copying raw markdown (good for pasting into LinkedIn/etc).
- Public job page (`/jobs/$slug`): replace the description `<p>` with `<Markdown>` so published posts look polished.

No changes to how AI generates the text, no changes to DB storage — markdown stays the source of truth.

## Technical notes

- Dependency: `bun add remark-gfm` (already have `react-markdown`).
- New file: `src/components/ui/markdown.tsx`.
- Edited files: `src/routes/_authenticated/app.c.$id.tsx`, `src/components/job-posts/job-posts-panel.tsx`, `src/routes/jobs/$slug.tsx`.
- Prompt update: `prompts` row with slug `chat.main` (append the formatting rule paragraph; no schema change).
- All styling uses semantic tokens from `src/styles.css` (`text-text`, `bg-bg-bubble`, etc.) — no raw colors.
- No backend / business-logic changes.
