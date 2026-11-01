-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('QUEUED', 'FILTERED', 'ANALYZED', 'FAILED');

-- CreateEnum
CREATE TYPE "ScriptStatus" AS ENUM ('REVIEW', 'SHOOT', 'EDIT', 'PUBLISH', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "HypothesisStatus" AS ENUM ('TESTING', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AiUsageKind" AS ENUM ('TRANSCRIPT', 'RELEVANCE', 'ANALYSIS', 'SCRIPT', 'REVISION');

-- CreateTable
CREATE TABLE "ReelMedia" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "transcript" TEXT,
    "frames" TEXT[],
    "error" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReelMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandMap" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "author" TEXT NOT NULL DEFAULT '',
    "niche" TEXT NOT NULL DEFAULT '',
    "audience" TEXT NOT NULL DEFAULT '',
    "products" TEXT NOT NULL DEFAULT '',
    "tone" TEXT NOT NULL DEFAULT '',
    "forbidden" TEXT NOT NULL DEFAULT '',
    "examples" TEXT NOT NULL DEFAULT '',
    "topics" TEXT NOT NULL DEFAULT '',
    "keywords" TEXT NOT NULL DEFAULT '',
    "exclusions" TEXT NOT NULL DEFAULT '',
    "relevanceThreshold" INTEGER NOT NULL DEFAULT 6,
    "scriptTemplate" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReelAnalysis" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" BOOLEAN NOT NULL DEFAULT false,
    "relevance" INTEGER,
    "relevanceReason" TEXT,
    "hook" TEXT,
    "hookType" TEXT,
    "structure" JSONB,
    "techniques" TEXT[],
    "cta" TEXT,
    "codeWord" TEXT,
    "whyItWorked" TEXT[],
    "topic" TEXT,
    "format" TEXT,
    "niche" TEXT,
    "adaptationIdeas" TEXT[],
    "error" TEXT,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyzedAt" TIMESTAMP(3),

    CONSTRAINT "ReelAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Technique" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "exampleUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Technique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hypothesis" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "HypothesisStatus" NOT NULL DEFAULT 'TESTING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hypothesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HypothesisReel" (
    "hypothesisId" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,

    CONSTRAINT "HypothesisReel_pkey" PRIMARY KEY ("hypothesisId","reelId")
);

-- CreateTable
CREATE TABLE "Script" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "analysisId" TEXT,
    "title" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "shots" JSONB NOT NULL,
    "ending" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "status" "ScriptStatus" NOT NULL DEFAULT 'REVIEW',
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Script_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScriptRevision" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "previous" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScriptRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "kind" "AiUsageKind" NOT NULL,
    "workspaceId" TEXT,
    "projectId" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReelMedia_reelId_key" ON "ReelMedia"("reelId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandMap_projectId_key" ON "BrandMap"("projectId");

-- CreateIndex
CREATE INDEX "ReelAnalysis_projectId_status_idx" ON "ReelAnalysis"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReelAnalysis_projectId_reelId_key" ON "ReelAnalysis"("projectId", "reelId");

-- CreateIndex
CREATE INDEX "Technique_projectId_idx" ON "Technique"("projectId");

-- CreateIndex
CREATE INDEX "Hypothesis_projectId_idx" ON "Hypothesis"("projectId");

-- CreateIndex
CREATE INDEX "Script_projectId_status_idx" ON "Script"("projectId", "status");

-- CreateIndex
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");

-- AddForeignKey
ALTER TABLE "ReelMedia" ADD CONSTRAINT "ReelMedia_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "ScrapedReel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandMap" ADD CONSTRAINT "BrandMap_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelAnalysis" ADD CONSTRAINT "ReelAnalysis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelAnalysis" ADD CONSTRAINT "ReelAnalysis_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "ScrapedReel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Technique" ADD CONSTRAINT "Technique_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hypothesis" ADD CONSTRAINT "Hypothesis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HypothesisReel" ADD CONSTRAINT "HypothesisReel_hypothesisId_fkey" FOREIGN KEY ("hypothesisId") REFERENCES "Hypothesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HypothesisReel" ADD CONSTRAINT "HypothesisReel_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "ScrapedReel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Script" ADD CONSTRAINT "Script_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Script" ADD CONSTRAINT "Script_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "ReelAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptRevision" ADD CONSTRAINT "ScriptRevision_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE CASCADE ON UPDATE CASCADE;
