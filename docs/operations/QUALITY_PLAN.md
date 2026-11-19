# RAMSport quality plan

Status: maintained baseline  
Owner: product maintainer  
Review: required for each production release

This plan defines pragmatic software quality controls for RAMSport. It supports an
ISO 9001-style quality system and software lifecycle practices, but does not by itself
establish certification or full conformity with any engineering standard.

## Controlled sources

- `docs/operations/` is the current operational baseline.
- `docs/operations/TRD.md` defines current product requirements.
- `compliance/compliance-matrix.md` maps implemented engineering methods and known gaps.
- `docs/specifications/`, `docs/status/` and `docs/archive/` are historical unless a
  maintained document explicitly adopts their content.

## Change control

Every production change must identify its requirement or defect, affected modules, risk,
verification method and reviewer. Calculation changes require a controlled reference case,
expected value, units, tolerance, source and independent engineering review. Security,
storage and schema changes require migration, rollback and backup/restore consideration.

## Verification gates

`npm run check` is the minimum automated gate. It performs strict TypeScript checking, the
repository conformance scan and a production build. This scan is structural evidence only;
manual and integration checks in `CHECKLIST.md` remain required until executable tests
replace them.

A release record must capture source revision, package version, UTC execution time,
environment, commands, results, tester, reviewer, deviations and approval. Test results in
ordinary prose are snapshots, not permanent proof that a later revision passes.

## Records and protection

Environment files, `.ramsport-data/`, exports and audit records must never enter source or
deployment packages. Production data requires access control, retention, backup, restore
testing and disposal rules set by the deploying organization. Audit retention is currently
bounded and is not suitable as immutable regulatory evidence; see `todolist.md`.

## Nonconformity and corrective action

Record defects with severity, impact, affected version, containment, root cause, correction,
verification and closure approval. Reopen a defect if verification fails. High-risk defects
block release unless an accountable owner documents and approves a time-bounded deviation.

## Release decision

Release approval requires the automated gate, applicable manual checks, resolved or accepted
risks, current traceability, verified backup/restore arrangements and an independent review
of safety- or calculation-significant changes. RAMSport must be described as supporting the
listed methods, not as certified, until an authorized assessment establishes otherwise.
