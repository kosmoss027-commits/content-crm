-- CreateEnum
CREATE TYPE "WatchStatus" AS ENUM ('WATCHING', 'PAUSED', 'CANDIDATE');

-- CreateEnum
CREATE TYPE "Market" AS ENUM ('CIS', 'FOREIGN');

-- CreateEnum
CREATE TYPE "ScrapeRunKind" AS ENUM ('INITIAL', 'SCHEDULED', 'MANUAL', 'PROFILE');

-- CreateEnum
CREATE TYPE "ScrapeRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "anomalyThreshold" DOUBLE PRECISION NOT NULL DEFAULT 10,
ADD COLUMN     "viralThreshold" DOUBLE PRECISION NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "ScrapedAccount" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "fullName" TEXT,
    "avatarUrl" TEXT,
    "followers" INTEGER,
    "medianViews" INTEGER,
    "reelsCount" INTEGER NOT NULL DEFAULT 0,
    "viralCount" INTEGER NOT NULL DEFAULT 0,
    "avgViralMultiplier" DOUBLE PRECISION,
    "rating" DOUBLE PRECISION,
    "lastScrapedAt" TIMESTAMP(3),
    "lastProfileAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapedReel" (
    "id" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "caption" TEXT,
    "views" INTEGER NOT NULL,
    "likes" INTEGER,
    "comments" INTEGER,
    "durationSec" DOUBLE PRECISION,
    "videoUrl" TEXT,
    "coverUrl" TEXT,
    "musicTitle" TEXT,
    "musicArtist" TEXT,
    "hashtags" TEXT[],
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "multiplier" DOUBLE PRECISION,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewsUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapedReel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" "WatchStatus" NOT NULL DEFAULT 'WATCHING',
    "market" "Market" NOT NULL DEFAULT 'CIS',
    "niche" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReelMark" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReelMark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeRun" (
    "id" TEXT NOT NULL,
    "kind" "ScrapeRunKind" NOT NULL,
    "status" "ScrapeRunStatus" NOT NULL,
    "workspaceId" TEXT,
    "projectId" TEXT,
    "apifyRunId" TEXT,
    "usernames" TEXT[],
    "itemsCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "error" TEXT,
    "failedAccounts" TEXT[],
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ScrapeRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScrapedAccount_username_key" ON "ScrapedAccount"("username");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapedReel_shortCode_key" ON "ScrapedReel"("shortCode");

-- CreateIndex
CREATE INDEX "ScrapedReel_accountId_postedAt_idx" ON "ScrapedReel"("accountId", "postedAt");

-- CreateIndex
CREATE INDEX "ScrapedReel_postedAt_idx" ON "ScrapedReel"("postedAt");

-- CreateIndex
CREATE INDEX "WatchlistEntry_workspaceId_idx" ON "WatchlistEntry"("workspaceId");

-- CreateIndex
CREATE INDEX "WatchlistEntry_accountId_idx" ON "WatchlistEntry"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistEntry_projectId_accountId_key" ON "WatchlistEntry"("projectId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "ReelMark_projectId_reelId_key" ON "ReelMark"("projectId", "reelId");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapeRun_apifyRunId_key" ON "ScrapeRun"("apifyRunId");

-- CreateIndex
CREATE INDEX "ScrapeRun_startedAt_idx" ON "ScrapeRun"("startedAt");

-- CreateIndex
CREATE INDEX "ScrapeRun_status_idx" ON "ScrapeRun"("status");

-- AddForeignKey
ALTER TABLE "ScrapedReel" ADD CONSTRAINT "ScrapedReel_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ScrapedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistEntry" ADD CONSTRAINT "WatchlistEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistEntry" ADD CONSTRAINT "WatchlistEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ScrapedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelMark" ADD CONSTRAINT "ReelMark_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelMark" ADD CONSTRAINT "ReelMark_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "ScrapedReel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
