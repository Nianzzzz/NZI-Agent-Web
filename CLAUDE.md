# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

NZi Agent Web — a multi-tenant AI agent workbench with dual-engine support (Pi Agent + Grok Agent), session tree visualization, Arena, and real-time collaboration.

## Current State

This repo is freshly initialized (git only, no application code yet). All technical details below describe the planned architecture. The actual codebase, commands, and file structure will be created during development.

## Planned Tech Stack

- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS + React Flow + Monaco Editor
- **Backend**: Node.js (Fastify) + Socket.io + BullMQ
- **Database**: PostgreSQL (Prisma ORM) + Redis
- **AI Engines**: Pi Agent SDK (Bailian OpenAI-compatible API), Grok Agent (Bailian API + independent model), Mock fallback

## Planned Architecture

- WebSocket lazy-loading: send references only, cache full data in Redis
- Dual-engine bridge: unified `AgentEvent` format across Pi and Grok
- Multi-tenant isolation: per-user data, API keys encrypted with AES-256-GCM
- Backend layers: Routes → Controllers → Services → Repositories
- WebSocket event naming: `<domain>:<action>` (e.g., `node:fetch_content`)

## Planned Coding Standards

- TypeScript strict mode; never use `any`; never use `// @ts-ignore` or similar escape hatches; if types cannot be expressed cleanly, declare a named interface or type alias instead
- All API routes validated with Zod schemas
- camelCase (functions/variables), PascalCase (types/classes), kebab-case (files/dirs)
- JSDoc on all exported/public functions
- Never put secrets in code or commits; use environment variables with a `.env` template file
- Run `pnpm lint` before committing (it surfaces type errors, unused variables, and formatting issues)

## Planned Development Workflow

Brainstorm → Spec → Plan → Execute → Verify → Review → Commit

## Sub-Agents (available via `.claude/agents/`)

- architect, fullstack-dev, frontend-dev, backend-dev, code-reviewer, security-auditor, test-engineer, doc-writer, devops-engineer
