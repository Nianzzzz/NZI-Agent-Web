# Engine Capabilities

> **Audience**: anyone wondering "what can NZi Agent Web actually do
> today?"
>
> Read this if you opened the dashboard, sent a chat, and got either
> a typewriter mock response or a real LLM answer and want to know
> what's next.

## TL;DR

NZi Agent Web is **single-engine**: Pi Agent, backed by Aliyun Bailian's
OpenAI-compatible API. When no API key is configured, a Mock adapter takes
over so the UI still works. There is no engine switcher — the user never
picks a backend.

| Capability                            | Mock | Pi (today) | Pi (Phase 2) |
| ------------------------------------- | :--: | :--------: | :----------: |
| Streaming reply                       |  ✓   |     ✓      |      ✓       |
| Thinking / chain-of-thought timeline  |  ✓   |     ✓      |      ✓       |
| Answer node (final text)              |  ✓   |     ✓      |      ✓       |
| **Stop / interrupt**                  |  ✓   |     ✓      |      ✓       |
| **Multi-turn memory across sessions** |  ✗   |     ✓      |      ✓       |
| **Tool calls** (read / bash / edit)   |  ✗   |     ✗      |      ✓       |
| **Session tree (branch / fork)**      |  ✗   |     ✗      |      ✓       |
| **Arena (side-by-side comparison)**   |  ✗   |     ✗      |      ✓       |
| **Real-time collab (multi-cursor)**   |  ✗   |     ✗      |      ✓       |

Shipped: streaming + timeline + stop + multi-turn context. Phase 2 (Q4 2026):
tools, session tree, arena, collaboration.

---

## What The User Sees Today

The user sends a prompt, watches the **AgentTimeline** render up to three
kinds of cards (thinking / tool / answer), and gets a final answer in the
message bubble. Mock and Pi emit the same event shape, so the UI is
identical either way — only the content differs.

### Pi Engine (`BailianAdapter`)

- Active when `BAILIAN_API_KEY` is set in `packages/backend/.env`.
- Talks to Bailian's OpenAI-compatible endpoint
  (`https://dashscope.aliyuncs.com/compatible-mode/v1`), default model
  `qwen-max-2025-01-25`.
- Streams `reasoning_content` as thinking-node deltas and `content` as
  answer-node deltas.
- Multi-turn: the WS controller loads the last 20 messages from Postgres
  and passes them as OpenAI-format `messages`.
- Stop button aborts the in-flight fetch; whatever streamed so far is
  persisted as an `INTERRUPTED` message.

### Mock Engine (`MockEngineAdapter`)

- Active when `BAILIAN_API_KEY` is missing — registered as the PI provider
  so routing is unchanged.
- Output: a scripted Chinese response streamed character-by-character,
  with a fake thinking block and a conditional tool call.
- Why we ship it: lets UI work proceed with zero external dependency, and
  gives new users something to click before wiring up a key.

### Phase 2 (next up)

- Tools: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`, with a
  per-session whitelist in the UI.
- Branching: fork any message into a new session branch; the session tree
  UI is the visible half of that.
- Arena: run two models on the same prompt and compare timelines.

---

## Request Flow

The frontend sends:

```ts
{ type: "chat", payload: { sessionId, prompt, thinkingLevel } }
```

The backend validates it with Zod, then
[`engine-bridge.ts`](../../packages/backend/src/engine/engine-bridge.ts)
calls `routePromptByProvider(EngineProvider.PI, options)`. Exactly one
adapter is registered under `PI` at startup — Bailian if a key exists,
Mock otherwise.

If the engine errors mid-stream (rate limit, bad key, network), the WS
sends an `error` event and the frontend shows a red banner. **There is no
silent fallback to mock once Bailian is registered** — we want the user to
see the real failure, not a typewriter response.

---

## Adding A New Engine

1. Implement `IEngineAdapter` (see
   [`shared-types/src/engine.ts`](../../packages/shared-types/src/engine.ts)).
2. Add a new value to the `EngineProvider` enum (both the TS enum and the
   Prisma enum in `prisma/schema.prisma`).
3. Register the adapter in
   [`engine-bridge.ts`](../../packages/backend/src/engine/engine-bridge.ts)'s
   `initializeAdapters`.
4. Document it here.

That's the whole adapter contract. The frontend, WS protocol, timeline
rendering, and persistence layer are engine-agnostic — note that reviving a
user-facing engine switcher would also mean re-adding a provider field to
the chat payload and session record, both of which were removed
deliberately.
