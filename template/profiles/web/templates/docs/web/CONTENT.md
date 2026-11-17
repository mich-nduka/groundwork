# Content Architecture

> Web profile. How the site's content is organised, modelled, owned and kept current. How it looks lives in `docs/design/DESIGN.md`; how people find it lives in `docs/web/SEO.md`.

## Audiences and goals
Who visits, what each audience came to do, and the action we want them to take next. Name the PRD capability (`CAP-NNN`) each goal serves.

| Audience | What they came for | Next action we want | Capability |
|---|---|---|---|
| | | | |

## Site map
The pages and sections, and how they nest. A tree or a table is enough.

| Page or section | Audience | Purpose | Main call to action |
|---|---|---|---|
| | | | |

## Page types
The reusable page layouts (home, article, landing page and so on) and the content blocks each one holds. `docs/design/DESIGN.md` §7.5 uses the same names.

| Page type | Content blocks | Used by |
|---|---|---|
| | | |

## Content model
The structured content types (article, author, product, question and answer...), their fields, which fields are required, and how the types relate. Describe the content, not a CMS (content management system) schema.

## Sources and publishing
Where content is written and stored (files in the repository, a CMS, a spreadsheet), who may publish, and how a change reaches the live site: preview, review, approval.

## Ownership and lifecycle
Who owns each section, how often it is reviewed, and what happens to outdated pages: update, redirect (record it in `docs/web/SEO.md`) or remove.

## Languages and regions
Only if the site is translated or regional: which languages, what varies by region, and who translates.

## Forms and conversions
Every form or conversion point: what it collects, where the data goes, and what the visitor sees afterwards. If forms collect personal data, record how it is protected in `docs/engineering/SECURITY.md`.
