# ADR 0003 — AI provider abstraction (Gemini + Anthropic + Bedrock)

- **Status:** Accepted (revised 2026-05-07)
- **Original date:** 2026-05-04 — initially Anthropic-default
- **Revision date:** 2026-05-07 — switched default to Gemini per project-owner decision; abstraction unchanged

## Context

The spec calls for the Anthropic Claude API. The project owner has elected to use Google Gemini as the active provider for v1 instead, citing cost and the team's existing Google API access. The architectural decision (provider abstraction so we can swap freely) does not change — the active provider does.

For HIPAA-eligible deployment, the BAA-eligible paths are:
- **Vertex AI** for Gemini (Google signs BAAs for healthcare customers using Vertex AI)
- **AWS Bedrock** for Claude (BAA-eligible via the standard AWS BAA)

Direct API access to either Gemini AI Studio or Anthropic does **not** include a BAA.

## Decision

1. All AI calls go through an `AIProvider` interface in `apps/api/src/services/ai/provider.ts`.
2. Three implementations:
   - `geminiProvider` — direct Google AI API (current default)
   - `anthropicProvider` — direct Claude API (alternative; kept available)
   - `bedrockProvider` — AWS Bedrock (HIPAA path for Claude; stubbed)
   - `vertexProvider` — *not yet implemented*; will be the HIPAA path for Gemini when first US tenant onboards
3. Provider is selected per-request via `User.hipaaTenant` flag and the global `AI_PROVIDER` env var.
4. Models are env-configured. Defaults track the latest Gemini 2.5 family:

| Feature | Gemini default | Anthropic equivalent |
|---|---|---|
| Document extraction | `gemini-2.5-flash` | `claude-sonnet-4-6` |
| Patient summary (doctor-facing) | `gemini-2.5-pro` | `claude-opus-4-7` |
| Doctor Q&A | `gemini-2.5-flash` | `claude-sonnet-4-6` |
| Cheap classification | `gemini-2.5-flash-lite` | `claude-haiku-4-5-20251001` |

5. Every AI call writes a row to `ai_call_logs` (provider, model, tokens, latency, success).
6. Vertex AI provider lands when first HIPAA tenant onboards.

## Why per-tenant, not global

A single deployment will serve both HIPAA and non-HIPAA tenants in the same database (multi-tenant). A global flag would force one type of tenant out. Per-request selection means we can sell the same product to a US clinic (Vertex/Bedrock route) and a Pakistani patient (Gemini direct route) without a fork.

## Cost guardrails (spec §8.6)

- Max 10 AI calls per patient per doctor per day (configurable via env).
- Patient summaries are cached by `record_set_hash` — regenerated only when the underlying record set changes.
- Drug-interaction checks run only on medication change, not on every record view.

## Consequences

- One extra layer of indirection in calls. Worth it.
- Adding a new provider is a new file in `services/ai/`, not a refactor.
- We continue to track the Anthropic provider in case Claude pricing or capabilities make it the better fit later — costs nothing to keep alongside Gemini.

## Out of scope

- Inter-provider response caching: each provider has its own response distribution, and a cache hit from one provider should not be served when the active provider changes.
- Custom prompt engineering per provider: the abstraction passes a single system prompt + content blocks. Provider-specific tuning lives in feature modules, not in the provider class.
