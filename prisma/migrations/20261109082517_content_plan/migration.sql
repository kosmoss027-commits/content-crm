-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('INSTAGRAM', 'STORIES', 'THREADS', 'TELEGRAM', 'YOUTUBE');

-- CreateEnum
CREATE TYPE "PublicationType" AS ENUM ('SALES', 'ENGAGING', 'EXPERT', 'CASE', 'ANNOUNCE');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('IDEA', 'SCRIPT', 'SHOOT', 'EDIT', 'READY', 'PUBLISHED');

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL DEFAULT 'INSTAGRAM',
    "type" "PublicationType" NOT NULL DEFAULT 'EXPERT',
    "status" "PublicationStatus" NOT NULL DEFAULT 'IDEA',
    "date" DATE,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "codeWord" TEXT,
    "labels" TEXT[],
    "isStar" BOOLEAN NOT NULL DEFAULT false,
    "referenceReelId" TEXT,
    "scriptId" TEXT,
    "igMediaId" TEXT,
    "permalink" TEXT,
    "mediaType" TEXT,
    "thumbnailUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "views" INTEGER,
    "reach" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "saves" INTEGER,
    "shares" INTEGER,
    "avgWatchSec" DOUBLE PRECISION,
    "statsUpdatedAt" TIMESTAMP(3),
    "coldAudiencePct" DOUBLE PRECISION,
    "profileVisits" INTEGER,
    "linkClicks" INTEGER,
    "follows" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "igUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Publication_scriptId_key" ON "Publication"("scriptId");

-- CreateIndex
CREATE INDEX "Publication_projectId_date_idx" ON "Publication"("projectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Publication_projectId_igMediaId_key" ON "Publication"("projectId", "igMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramConnection_projectId_key" ON "InstagramConnection"("projectId");

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_referenceReelId_fkey" FOREIGN KEY ("referenceReelId") REFERENCES "ScrapedReel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramConnection" ADD CONSTRAINT "InstagramConnection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
