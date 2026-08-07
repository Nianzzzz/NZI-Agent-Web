# Engine Capabilities

> **Audience**: anyone wondering "what can NZi Agent Web actually do
> today, and which engine should I pick?"
>
> Read this if you opened the dashboard, sent a chat, and got either
> a typewriter mock response or a real LLM answer and want to know
> what's next.

## TL;DR

| Capability                            | Mock | Pi (Phase 1) | Pi (Phase 2) | Grok |
| ------------------------------------- | :--: | :----------: | :----------: | :--: |
| Streaming reply                       |  ✓   |      ✓       |      ✓       |  ✓   |
| Thinking / chain-of-thought timeline  |  ✓   |      ✓       |      ✓       |  ✓   |
| Answer node (final text)              |  ✓   |      ✓       |      ✓       |  ✓   |
| **Tool calls** (read / bash / edit)   |  ✗   |      ✗       |      ✓       |  ✗   |
| **Multi-turn memory across sessions** |  ✗   |      ✗       |      ✓       |  ✗   |
| **Stop / interrupt**                  |  ✓   |      ✓       |      ✓       |  ✓   |
| **Session tree (branch / fork)**      |  ✗   |      ✗       |      ✓       |  ✗   |
| **Arena (side-by-side comparison)**   |  ✗   |      ✗       |      ✓       |  ✗   |
| **Real-time collab (multi-cursor)**   |  ✗   |      ✗       |      ✓       |  ✗   |

Phase 1 (shipped): streaming + timeline + stop. Phase 2 (Q4 2026):
tools, memory, session tree, arena, collaboration.

---

## What The User Sees Today

Whichever engine is selected, the **UI is identical**. The user
sends a prompt, watches the **AgentTimeline** render three kinds of
cards (thinking / tool / answer), and gets a final answer in the
message bubble. The engine only differs in **what the cards actually
contain** and **how trustworthy the output is**.

### Mock Engine (`MockAdapter`)

- Active when: `agentType=PI` but no API key is configured, OR the user
  forces it via the engine selector.
- Output: a long Lorem-Ipsum-ish Chinese paragraph streamed at ~70
  chars/sec with a fake "thinking…" block beforehand.
- Why we ship it: lets the UI team build and test the AgentTimeline
  with zero external dependency, and gives new users something to
  click on before they wire up a real key.

### Pi Engine — Phase 1 (`PiAdapter`)

- Active when: an `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / etc. is
  set in `packages/backend/.env`.
- What it actually does today: pure chat. The adapter calls
  `createAgentSession({ cwd, noTools: "all" })` — no tools, no file
  access, no shell. Just a model in a box.
- What you get: a real LLM streaming thinking + answer through the
  same timeline UI. Stop button works (sends
  `AbortController.abort()` into the SDK subscriber).
- What's missing: file tools, long-term memory, ability to actually
  _do_ anything beyond answering.

### Pi Engine — Phase 2 (next up)

- Tools: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`
  (the Pi Agent built-ins). Per-session tool whitelist in the UI.
- Memory: Pi Agent sessions persist to SQLite (`~/.pi/agent/sessions/`)
  — we'll mirror that into the Postgres `messages` table so users can
  browse history from the NZi dashboard.
- Branching: Pi's session model supports forking; the session tree
  UI is the visible half of that.

### Grok Engine (`GrokAdapter`)

- Active when: `agentType=GROK` and `XAI_API_KEY` is set.
- Currently a thin pass-through to the xAI / Grok API. Useful for
  xAI-tuned responses; the adapter normalises events into the same
  shape Pi uses, so the timeline renders identically.
- Phase 2 will add tool support and session memory.

---

## Engine Selection Logic

The frontend sends `agentType` in the chat payload:

```ts
{ type: "chat", payload: { sessionId, agentType: "PI" | "GROK", prompt } }
```

The backend's [`engine-bridge.ts`](../../packages/backend/src/engine/engine-bridge.ts)
calls `routePromptByProvider(EngineProvider[agentType], options)`,
which picks the right adapter. The selector on the chat input lets
the user pick per-message (Phase 2 will also let them pin per-session).

If the chosen engine isn't healthy (no API key, SDK import failed,
etc.), the adapter throws and the WS sends an `error` event — the
frontend shows a red banner with the error message. **There is no
silent fallback to mock** for the real engines; we want the user to
see the missing-key problem, not a typewriter response.

---

## Picking An Engine

| You want to…                                | Pick   | Why                                                    |
| ------------------------------------------- | ------ | ------------------------------------------------------ |
| Just kick the tires / develop the UI        | Mock   | Zero setup                                             |
| Real LLM answers, single-turn Q&A           | Pi     | Cheapest, most providers, best default model selection |
| xAI / Grok-tuned style                      | Grok   | Direct line to xAI                                     |
| Tool use (read, bash, edit) — Phase 2       | Pi     | Only Pi has the SDK tool registry                      |
| Multi-turn coding sessions — Phase 2        | Pi     | Pi's session + SQLite store                            |
| Compare two models side by side — Phase 2   | Arena  | Run Pi and Grok in parallel, see both timelines        |

---

## Adding A New Engine

1. Implement `IEngineAdapter` (see
   [`shared-types/src/engine.ts`](../../packages/shared-types/src/engine.ts#L107)).
2. Add a new value to the `EngineProvider` enum.
3. Register the adapter in
   [`engine/adapters/index.ts`](../../packages/backend/src/engine/adapters/index.ts).
4. Add a row in the `engines` enum on the Prisma side so the
   `Session.engine` column can hold the new value.
5. Document the new engine here + add a setup section.

That's all the adapter contract asks for. The frontend, WS protocol,
timeline rendering, and persistence layer are engine-agnostic.
