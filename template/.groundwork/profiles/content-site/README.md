# Content Site Profile

For websites whose main job is to publish content: landing pages, marketing and corporate sites, documentation and content sites. A web app — people sign in and work with their own data — is an Application, whatever it runs in. This profile was called Web before Groundwork 4.0; `web` still works as its ID. When it applies, which documents it adds and which checks it needs are declared in [profile.json](profile.json).

## Where each concern lives

| Concern | Lives in |
|---|---|
| Site map, page types, content model, publishing and ownership | `docs/content-site/CONTENT.md` |
| Search, sharing previews, redirects, analytics consent | `docs/content-site/SEO.md` |
| Visual identity, tokens, components | `docs/design/DESIGN.md` §3–5 |
| Page structure and screen names | `docs/design/DESIGN.md` §7, using the page types from `CONTENT.md` |
| Accessibility standard | `docs/design/DESIGN.md` §6.7 |
| Accessibility and performance targets (measurable) | `SYS-NFR` rows in `docs/product/SPEC.md` §5 |
| Hosting, CMS and build pipeline | `docs/architecture/SYSTEM_DESIGN.md` (add its Architecture and interfaces part if the site integrates with several services) |

There is no separate performance or accessibility document on purpose: measurable targets are requirements, and requirements live in `SPEC.md`.

## Engineering standards

Defaults for the public pages. A project can override any of them with a requirement in `SPEC.md` or an accepted ADR.

- Pages are readable and navigable before scripts load. Scripts add to the page; they don't build it.
- Meet the accessibility standard named in `DESIGN.md` §6.7 — WCAG 2.2 level AA (the common web accessibility standard) unless the project says otherwise.
- Set a performance budget per page type (page weight, loading-speed metrics) in `SPEC.md`, and measure it on a realistic device and connection.
- Every moved or removed page gets a redirect. Never break a URL that has been public.
- Images have text alternatives, explicit sizes, and formats suited to the screen.
- No tracking runs before the visitor consents where the law requires consent.
- Content changes do not need a code change, unless the project has decided they should (record that in `CONTENT.md`).

## Agent instructions

- Before changing a page, find its page type in `CONTENT.md` and its metadata rules in `SEO.md`.
- When you add, move or remove a page: update the site map in `CONTENT.md`, add a redirect to `SEO.md` if the URL changes, and keep the page names in `DESIGN.md` §7.5 the same.
- When you change a page type's layout, run the accessibility and performance checks for that page type.
- Do not add a second copy of a fact that already lives in `CONTENT.md`, `SEO.md` or `DESIGN.md` — link to it.

## Composing with other profiles

- **With Application:** Content site covers the public pages; Application covers the signed-in product. Say in `CONTENT.md` where the boundary is (for example, "everything under `/app` is the application").
- **With AI Systems:** only when the site has an AI feature that runs for visitors, such as a chat assistant. Using AI to write the content does not count.
