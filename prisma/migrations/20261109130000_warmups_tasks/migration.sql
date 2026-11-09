-- CreateEnum
CREATE TYPE "Rubric" AS ENUM ('LIFE', 'CASE', 'EXPERT', 'OFFER', 'THOUGHTS', 'STORIES');

-- CreateEnum
CREATE TYPE "WarmupDayKind" AS ENUM ('START', 'LIVE', 'IMPORTANT', 'OPEN_DAY');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

-- AlterTable
ALTER TABLE "Publication" ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "meanings" TEXT[],
ADD COLUMN     "rubric" "Rubric";

-- CreateTable
CREATE TABLE "WarmupCampaign" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "product" TEXT NOT NULL DEFAULT '',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "salesStartDate" DATE,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarmupCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarmupDay" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "WarmupDayKind",
    "meaning" TEXT NOT NULL DEFAULT '',
    "telegramPost" TEXT NOT NULL DEFAULT '',
    "stories" TEXT NOT NULL DEFAULT '',
    "meanings" TEXT[],

    CONSTRAINT "WarmupDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "dueDate" DATE,
    "assigneeId" UUID,
    "createdById" UUID NOT NULL,
    "publicationId" TEXT,
    "clientId" TEXT,
    "reelId" TEXT,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WarmupCampaign_projectId_startDate_idx" ON "WarmupCampaign"("projectId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "WarmupDay_campaignId_date_key" ON "WarmupDay"("campaignId", "date");

-- CreateIndex
CREATE INDEX "Task_projectId_status_dueDate_idx" ON "Task"("projectId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Task_assigneeId_status_idx" ON "Task"("assigneeId", "status");

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "WarmupCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarmupCampaign" ADD CONSTRAINT "WarmupCampaign_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarmupDay" ADD CONSTRAINT "WarmupDay_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarmupDay" ADD CONSTRAINT "WarmupDay_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "WarmupCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "ScrapedReel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
