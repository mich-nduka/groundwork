# Repository Automation (Optional)

For GitHub users. Two starter files are included:

- `pull_request_template.md`: the pull request form. Its checkbox list mirrors the Definition of done in `AGENTS.md`, which holds the full definitions.
- `workflows/docs-check.yml`: a small CI workflow that runs `python3 scripts/check_docs.py --strict` on pushes and pull requests. The warnings come in two groups: hygiene (invalid status values, unserved capabilities, documents from inactive profiles, profile checks missing from the tooling table) and coverage (a requirement no design doc, plan or test references). Each group fails only under its flag:

  - Default: only errors fail.
  - `--strict`: hygiene warnings fail too.
  - `--strict-coverage`: coverage warnings fail too.

  `--strict-coverage` does not include `--strict`. Use both flags together to fail on everything, for example `python3 scripts/check_docs.py --strict --strict-coverage` once every requirement is referenced somewhere.

Add more workflows only when the project needs them, and make the required checks match the code standards in `AGENTS.md` (including the rows your profiles added to its tooling table) and the test strategy. Delete anything you don't use.
