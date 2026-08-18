-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TenantRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "EngineProvider" AS ENUM ('PI', 'GROK');

-- CreateEnum
CREATE TYPE "ThinkingLevel" AS ENUM ('OFF', 'LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL_RESULT');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('COMPLETED', 'INTERRUPTED');

-- CreateEnum
CREATE TYPE "AgentEventType" AS ENUM ('AGENT_START', 'AGENT_END', 'TURN_START', 'TURN_END', 'MESSAGE_START', 'MESSAGE_UPDATE', 'MESSAGE_END', 'TOOL_EXECUTION_START', 'TOOL_EXECUTION_UPDATE', 'TOOL_EXECUTION_END', 'COMPACTION_START', 'COMPACTION_END', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "settings" JSONB,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_members" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "TenantRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engine_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "EngineProvider" NOT NULL,
    "apiKeyEncrypted" TEXT,
    "apiKeyIv" TEXT,
    "apiKeyTag" TEXT,
    "model" TEXT,
    "thinkingLevel" "ThinkingLevel",
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engine_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "engine" "EngineProvider" NOT NULL DEFAULT 'PI',
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "parentSessionId" TEXT,
    "rootNodeId" TEXT,
    "summary" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "rootEventId" TEXT,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "reasoning" TEXT,
    "toolCalls" JSONB,
    "tokenUsage" JSONB,
    "latencyMs" INTEGER,
    "status" "MessageStatus" NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "provider" "EngineProvider" NOT NULL,
    "eventType" "AgentEventType" NOT NULL,
    "parentEventId" TEXT,
    "nodeId" TEXT NOT NULL,
    "isFork" BOOLEAN NOT NULL DEFAULT false,
    "isArena" BOOLEAN NOT NULL DEFAULT false,
    "content" TEXT,
    "traceId" TEXT NOT NULL,
    "durationMs" INTEGER,
    "tokenUsage" JSONB,
    "eventData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_nodes" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_members_userId_tenantId_key" ON "tenant_members"("userId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "engine_configs_tenantId_provider_key" ON "engine_configs"("tenantId", "provider");

-- CreateIndex
CREATE INDEX "sessions_tenantId_createdAt_idx" ON "sessions"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "sessions_userId_createdAt_idx" ON "sessions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "sessions_parentSessionId_idx" ON "sessions"("parentSessionId");

-- CreateIndex
CREATE INDEX "messages_sessionId_createdAt_idx" ON "messages"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "agent_events_nodeId_key" ON "agent_events"("nodeId");

-- CreateIndex
CREATE INDEX "agent_events_sessionId_createdAt_idx" ON "agent_events"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_events_sessionId_parentEventId_idx" ON "agent_events"("sessionId", "parentEventId");

-- CreateIndex
CREATE INDEX "agent_events_traceId_idx" ON "agent_events"("traceId");

-- CreateIndex
CREATE INDEX "agent_events_nodeId_idx" ON "agent_events"("nodeId");

-- CreateIndex
CREATE INDEX "session_nodes_sessionId_idx" ON "session_nodes"("sessionId");

-- AddForeignKey
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engine_configs" ADD CONSTRAINT "engine_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_rootEventId_fkey" FOREIGN KEY ("rootEventId") REFERENCES "agent_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_parentEventId_fkey" FOREIGN KEY ("parentEventId") REFERENCES "agent_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

