# MediVault docs

| File | Audience |
|---|---|
| [`adr/`](./adr/) | Engineering — architectural decisions with rationale |
| [`api/openapi.yaml`](./api/openapi.yaml) | API consumers — OpenAPI 3.0.3 spec, paste into [editor.swagger.io](https://editor.swagger.io) for a browsable UI |
| [`api/medivault.postman_collection.json`](./api/medivault.postman_collection.json) | Anyone testing the API — import into Postman or Insomnia |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Ops — first-deploy runbook + release process + observability + known gaps before paid customers |

## Quick links

- **Top-level README** at the repo root has the local-dev quickstart and stack overview.
- **Spec**: `MediVault_Specification.docx` — original product spec, lightly stale (v1 backend now diverges from it in details). Use ADRs + this docs folder for current truth.
- **CI**: `.github/workflows/ci.yml` — runs api lint+tests, mobile typecheck, shared typecheck on every push/PR.

## What's missing here

- **Architecture diagrams** (sequence diagrams for upload, doctor-access, emergency scan). The textual flow in `DEPLOYMENT.md` and the comments in `services/` cover most of it; visuals would be a polish pass.
- **A Dockerfile for the API.** Listed as a blocker in `DEPLOYMENT.md`. Build instructions assume one exists.
- **Terraform / CDK.** Same — listed as a gap.
