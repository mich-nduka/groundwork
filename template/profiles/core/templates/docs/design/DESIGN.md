# Design

> **No user interface? Skip this file.** For a product without screens — an API, a background service — mark this document not applicable and keep interface contracts in the architecture documents instead.
>
> **Start here.** Fill in these five sections first: §2 experience principles, §3.1 brand foundation, §4.3 semantic tokens, §5.3 component inventory, §6.4 UI states. The remaining sections can stay empty — fill them in when the work needs them.
>
> One document for everything about how the product looks, feels and is structured: identity, design tokens, components, UX and information architecture. Use it for anything with a visual or interactive interface. The system-facing side — which interaction triggers which system operation, and screens as system surfaces — is mapped in `docs/architecture/system-design/07-ui-and-interaction-mapping.md`. Use the same screen names and state lists in both.

## 1. Governance

- Design owner:
- Status:
- Supported platforms:
- Source of truth (design file / token package):
- Who reviews and approves changes:

How designs become code:

- Where tokens live and what formats they're exported to:
- Where components are implemented:
- Design review process:
- How visual regressions (unintended visual changes) are caught:
- How things get deprecated and migrated:

## 2. Product experience principles

A short list of principles to weigh trade-offs against. Keep them consistent with the brand attributes in §3.1.

## 3. Visual identity

Start with §3.1 (one of the first five). Fill §3.2–3.7 in when the work needs them.

### 3.1 Brand foundation
- Purpose:
- Mission:
- Audience:
- Positioning:
- Brand attributes:
- The feeling it should give people:

### 3.2 Logo system
- Primary mark:
- Alternate marks:
- Clear space:
- Minimum sizes:
- Approved backgrounds:
- Misuse to avoid:

### 3.3 Colour identity
The brand colours and where each may be used. Colours that mean something in the UI (like error red) belong in the token system (§4), not here.

### 3.4 Typography
- Typeface families and licensing:
- Weights:
- Hierarchy:
- Numerals / data display:
- Fallbacks:

### 3.5 Imagery and illustration
- Photography:
- Illustration:
- Iconography:
- Data visualization:
- Prohibited treatments:

### 3.6 Motion and sound identity
Include only where relevant. Motion timings and easings are tokens (§4.2); rules for using them live in §6.8.

### 3.7 Examples
Link to approved assets and examples. Never embed credentials or private asset links.

## 4. Design tokens

Start with §4.3 (one of the first five). Fill the other subsections in when needed.

Design tokens are the named values the UI is built from — colours, sizes, spacing and so on. Components should use these tokens, never one-off values.

### 4.1 Token principles
- Prefer semantic tokens in product components — a token named for its meaning, like `color.text.primary`, not a raw value.
- Keep raw palette values separate from the roles they play.
- Choose platform themes and modes deliberately.
- Avoid one-off values unless they're documented and justified.
- Keep the token source, generated outputs and design-tool values in sync.

### 4.2 Token categories
| Category | Examples |
|---|---|
| Colour | brand, text, surface, border, status |
| Typography | family, size, weight, line height, tracking |
| Spacing | inset, stack, inline, layout gap |
| Sizing | control height, icon size, container width |
| Shape | radius, border width |
| Elevation | shadow, overlay |
| Motion | duration, easing, distance |
| Breakpoints | compact, medium, expanded |

### 4.3 Semantic token catalogue
| Token | Meaning | Value / reference | Theme | Status |
|---|---|---|---|---|
| `color.text.primary` | Main readable text | [Value] | [Theme] | [Status] |

### 4.4 Naming convention
Pick a stable hierarchy, for example: `{category}.{role}.{variant}.{state}`

### 4.5 Themes and modes
Document light/dark, high-contrast, brand and platform modes where needed.

### 4.6 Token lifecycle
How tokens are proposed, reviewed, deprecated, migrated and removed.

### 4.7 Implementation source
- Canonical source:
- Generated formats:
- Package / file locations:
- Validation:

## 5. Components

Start with §5.3 (one of the first five). Fill the other subsections in when needed.

### 5.1 Component principles
How components are composed, reused, customised and owned.

### 5.2 Component specification template

For each component, fill in:

**[Component name]**
- Purpose:
- When to use:
- When not to use:
- Anatomy:
- Variants:
- Sizes:
- Properties / inputs:
- States: default, hover, focus, pressed, disabled, loading, error, selected
- Responsive behaviour:
- Accessibility:
- Content guidance:
- Examples:
- Implementation location:
- Tests:

### 5.3 Component inventory
| Component | Purpose | Status | Owner | Implementation |
|---|---|---|---|---|

### 5.4 Contribution rules
How components are reviewed, tested, documented, versioned and deprecated.

## 6. UX and interaction

Start with §6.4 (one of the first five). Fill the other subsections in when needed.

### 6.1 Navigation and wayfinding
### 6.2 Forms and validation
### 6.3 Search, filtering, and sorting
### 6.4 UI states (feedback and system status)
Cover loading, success, empty, error, offline, permission and destructive-action states. The system behaviour behind each state is mapped in `docs/architecture/system-design/07-ui-and-interaction-mapping.md`.
### 6.5 Error prevention and recovery
### 6.6 Content and microcopy
### 6.7 Accessibility and responsive behaviour
The standards to meet: supported input methods, text scaling, contrast, focus, keyboard and screen-reader behaviour, and how layouts adapt. System-side accessibility constraints are recorded in `docs/architecture/system-design/07-ui-and-interaction-mapping.md`.
### 6.8 Motion and reduced motion
How motion is used, and what replaces it when people turn it off. Durations, easings and distances come from the motion tokens (§4.2).

## 7. Information architecture

Fill this in when navigation or content structure is substantial. This section owns how content is organised and how screens relate (§7.5); `docs/architecture/system-design/07-ui-and-interaction-mapping.md` owns what each screen does to the system — use the same screen names in both.

### 7.1 Content and capability inventory
### 7.2 User groups and access needs
### 7.3 Navigation model
### 7.4 Hierarchy and taxonomy
### 7.5 Routes / screens / views
| ID | Name | Purpose | Entry points | Exit / next steps | Access |
|---|---|---|---|---|---|
### 7.6 Search and findability
### 7.7 Content lifecycle and ownership

## 8. Platform adaptations

Fill in when needed: where platform conventions differ, and what must stay consistent everywhere.

## 9. Research and validation

Fill in when needed: user research, usability testing, and how the information architecture is checked against real users (§7.1–7.7).

## 10. UX review checklist

Use this checklist when reviewing designs and implementations:

- [ ] Experience principles applied
- [ ] Navigation and wayfinding clear
- [ ] Forms follow the validation guidance (§6.2)
- [ ] Every system state covered (§6.4)
- [ ] Accessibility requirements met (§6.7)
- [ ] Responsive behaviour verified (§6.7)
- [ ] Motion respects reduced-motion preference (§6.8)
- [ ] Semantic tokens used — no one-off values (§4.1)
- [ ] Components match the specification template (§5.2)
- [ ] Content follows the microcopy guidance (§6.6)
