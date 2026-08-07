# Pi Agent API Setup Guide

> **Audience**: NZi Agent Web developers wiring up a real LLM behind the
> `Pi` engine. Read this when you want to see actual model output instead of
> the mock engine's typewriter fallback.

## TL;DR

1. Pick a provider (Anthropic / OpenAI / DeepSeek / xAI / OpenRouter / …).
2. Set the matching API key env var on the backend process.
3. Restart the backend. Pi Agent SDK auto-detects the key and uses the
   provider's default model.
4. (Optional) Pick a non-default model by writing `~/.pi/agent/models.json`.
5. (Optional) For local Ollama / vLLM / LM Studio, see
   [Local Models](#local-models-ollama--vllm--lm-studio).

> Pi Agent looks at environment variables first, then falls back to
> `~/.pi/agent/auth.json` (created by `/login` in interactive mode). Our
> adapter passes neither key to the SDK directly — we just call
> `createAgentSession({ cwd, noTools: "all" })` and let the SDK resolve
> credentials from the environment. See
> [`pi-adapter.ts`](../../packages/backend/src/engine/adapters/pi-adapter.ts).

---

## Why This Document Exists

NZi Agent Web is engine-agnostic. The backend exposes a unified
`IEngineAdapter` interface, and currently ships two adapters:

- `PiAdapter` — wraps Pi Agent SDK (preferred for coding tasks)
- `GrokAdapter` — talks to xAI / Grok directly
- `MockAdapter` — fallback that streams fake typewriter output (so the UI
  is testable without any API key)

This document covers the **Pi** path. For the engine comparison see
[`engine-capabilities.md`](./engine-capabilities.md).

---

## Quick Start (5 minutes)

### Option A — Environment variable (recommended for dev)

```bash
# 1. Pick a provider and put the key in packages/backend/.env
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> packages/backend/.env

# 2. Restart the backend (pnpm --filter backend dev)
pnpm --filter backend dev
```

That's it. The first chat through the `Pi` engine will resolve to
Anthropic's default model. The default for Anthropic is `claude-opus-4-7`
(per `packages/pi-agent/.../docs/models.md`); if the actual default has
moved on, the SDK prints the chosen model in the backend log.

### Option B — Auth file (matches Pi's interactive UX)

```bash
# Run the Pi Agent TUI once, log in, then quit
pi

# Inside Pi:
#   /login
#   → pick "Anthropic"
#   → choose "Use an API key"
#   → paste sk-ant-...
#   → Ctrl-C to exit
```

The token is written to `~/.pi/agent/auth.json`. The backend picks it up
on the next request without any extra config.

---

## Supported Providers

Pi Agent supports many providers out of the box. Here is the quick map;
for the full list see
[`packages/pi-agent/.../docs/providers.md`](../../packages/pi-agent/packages/coding-agent/docs/providers.md).

| Provider          | Env var                | Notes                                              |
| ----------------- | ---------------------- | -------------------------------------------------- |
| **Anthropic**     | `ANTHROPIC_API_KEY`    | Default: `claude-opus-4-7`                         |
| **OpenAI**        | `OPENAI_API_KEY`       | Default: `gpt-5.6` (Sol/Terra/Luna)                |
| **DeepSeek**      | `DEEPSEEK_API_KEY`     | Cheap, good for code                               |
| **xAI (Grok)**    | `XAI_API_KEY`          | Already declared in `.env.example`                 |
| **OpenRouter**    | `OPENROUTER_API_KEY`   | Aggregator, many models                            |
| **Google Gemini** | `GEMINI_API_KEY`       |                                                    |
| **Mistral**       | `MISTRAL_API_KEY`      |                                                    |
| **Groq**          | `GROQ_API_KEY`         | Fast inference                                     |
| **NVIDIA NIM**    | `NVIDIA_API_KEY`       |                                                    |
| **Cerebras**      | `CEREBRAS_API_KEY`     |                                                    |
| **Cloudflare AI** | `CLOUDFLARE_API_KEY`   | Needs `CLOUDFLARE_ACCOUNT_ID` too                  |
| **Ant Ling**      | `ANT_LING_API_KEY`     |                                                    |

### Subscription auth (OAuth)

For Anthropic, OpenRouter, and a few others Pi Agent also supports
OAuth via `/login` — useful if you have a Claude Pro / Max plan and want
extra usage billed at API rates (not against the plan). See
[providers.md § Auth File](../../packages/pi-agent/packages/coding-agent/docs/providers.md#auth-file).

---

## Picking a Model

If you don't pick one, Pi Agent uses the provider's default. The defaults
are tracked in the Pi Agent's `getModel` registry and are listed in
[`models.md`](../../packages/pi-agent/packages/coding-agent/docs/models.md).

### Override the model for one chat (Phase 2 — not yet wired)

The `IEngineAdapter.streamPrompt` interface accepts a `PromptOptions`
object. We will extend it to accept a `model` field in Phase 2, so the
frontend can pick a model per session.

### Override the model globally

Edit `~/.pi/agent/models.json`:

```json
{
  "providers": {
    "anthropic": {
      "models": [
        { "id": "claude-sonnet-4-5", "name": "Claude Sonnet 4.5" }
      ]
    }
  }
}
```

Or to use a totally custom model string, add it to the same file and
reference it in `/model` inside Pi's TUI.

---

## Local Models (Ollama / vLLM / LM Studio)

For local development without an internet API key, point Pi Agent at a
local server. See
[`models.md § Minimal Example`](../../packages/pi-agent/packages/coding-agent/docs/models.md#minimal-example).

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        { "id": "llama3.1:8b" },
        { "id": "qwen2.5-coder:7b" }
      ]
    }
  }
}
```

Pi treats models as requiring auth even for keyless local servers; the
dummy `"ollama"` value satisfies that check. Some OpenAI-compatible
servers (e.g. older vLLM) don't accept the `developer` role used for
reasoning — set `compat.supportsDeveloperRole: false` if that bites
you.

---

## Verifying the Setup

Three checks in order of fastness:

1. **Health probe**

   ```bash
   curl -s -H "Authorization: Bearer $ADMIN_JWT" \
        http://localhost:4000/api/engine/health
   # Expect: { "engines": { "PI": { "healthy": true, ... }, ... } }
   ```

2. **Direct SDK smoke test** (no NZi in the loop)

   ```bash
   cd packages/pi-agent
   pnpm --filter @earendil-works/pi-coding-agent exec tsx \
        packages/coding-agent/examples/sdk/01-minimal.ts
   ```

3. **End-to-end via NZi WS**

   ```bash
   # In one terminal:
   pnpm --filter backend dev
   # In another:
   WS_TEST_ADMIN_EMAIL=admin@nzilab.com \
   WS_TEST_ADMIN_PASSWORD=Admin@2026! \
     node packages/backend/scripts/ws-fold-test.js
   ```

   If you see `✅ ALL CHECKS PASSED`, the SDK is reading your API key
   and streaming thinking + answer events.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Engine error: 401 Unauthorized` from Pi | Missing / wrong API key | Double-check env var, restart backend |
| `Engine error: 404 model not found` | Default model renamed upstream | Pin a model in `~/.pi/agent/models.json` |
| `Engine error: ECONNREFUSED 127.0.0.1:11434` | Local server not running | Start Ollama / vLLM, verify port |
| `Engine error: prompt timeout after 120000ms` | Model too slow or hung | Check backend logs for partial events; raise `DEFAULT_PROMPT_TIMEOUT_MS` in `pi-adapter.ts` |
| Adapter says `Pi Agent SDK not available` | Submodule not initialised | `git submodule update --init --recursive` |

---

## Security Notes

- **Never commit API keys.** `.env` is gitignored. `.env.example` is the
  template.
- The Pi adapter does **not** log request bodies, but the model
  provider may. Do not put PII in prompts.
- The adapter uses `noTools: "all"` in Phase 1 — even if a tool is
  enabled by the SDK, our adapter does not forward tool calls. Phase 2
  will expose a per-session tool whitelist through the UI.

---

## See Also

- [`engine-capabilities.md`](./engine-capabilities.md) — what each
  engine can actually do.
- [`../../packages/pi-agent/.../docs/sdk.md`](../../packages/pi-agent/packages/coding-agent/docs/sdk.md)
  — full Pi Agent SDK reference.
- [`../../packages/pi-agent/.../docs/providers.md`](../../packages/pi-agent/packages/coding-agent/docs/providers.md)
  — every supported provider.
- [`../../packages/pi-agent/.../docs/models.md`](../../packages/pi-agent/packages/coding-agent/docs/models.md)
  — custom model + Ollama/vLLM setup.
