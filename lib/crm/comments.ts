// Комментарии Instagram → упоминания кодовых слов → заявки. Первое касание определяет публикацию-источник.
import { prisma } from "@/lib/db/prisma";
import { findKeywords, normalizeHandle } from "@/lib/crm/keywords";

export type IncomingComment = { igCommentId: string; igMediaId: string; username: string; text: string; at: Date };

export type CommentsReport = { mentions: number; newLeads: number };

/** Повторный вызов с теми же комментариями ничего не дублирует. */
export async function recordComments(project: { projectId: string; workspaceId: string }, comments: IncomingComment[]): Promise<CommentsReport> {
  const keywords = await prisma.keyword.findMany({ where: { projectId: project.projectId, archivedAt: null }, select: { id: true, word: true } });
  if (keywords.length === 0 || comments.length === 0) return { mentions: 0, newLeads: 0 };
  const wordToId = new Map(keywords.map((k) => [k.word, k.id]));

  const mediaIds = [...new Set(comments.map((c) => c.igMediaId))];
  const publications = await prisma.publication.findMany({
    where: { projectId: project.projectId, igMediaId: { in: mediaIds } },
    select: { id: true, igMediaId: true },
  });
  const publicationByMedia = new Map(publications.map((p) => [p.igMediaId, p.id]));

  const matches = comments.flatMap((comment) =>
    findKeywords(comment.text, [...wordToId.keys()]).map((word) => ({
      comment,
      keywordId: wordToId.get(word)!,
      handle: normalizeHandle(comment.username),
      publicationId: publicationByMedia.get(comment.igMediaId) ?? null,
    })),
  );
  if (matches.length === 0) return { mentions: 0, newLeads: 0 };

  // Заявки создаём только по новым комментариям: если заявку удалили вручную, повторное обновление её не вернёт
  const known = await prisma.keywordMention.findMany({
    where: { projectId: project.projectId, igCommentId: { in: [...new Set(matches.map((m) => m.comment.igCommentId))] } },
    select: { igCommentId: true, keywordId: true },
  });
  const knownKeys = new Set(known.map((k) => `${k.igCommentId}|${k.keywordId}`));
  const fresh = matches.filter((m) => !knownKeys.has(`${m.comment.igCommentId}|${m.keywordId}`));
  if (fresh.length === 0) return { mentions: 0, newLeads: 0 };

  const created = await prisma.keywordMention.createMany({
    data: fresh.map((m) => ({
      workspaceId: project.workspaceId,
      projectId: project.projectId,
      keywordId: m.keywordId,
      publicationId: m.publicationId,
      handle: m.handle,
      igCommentId: m.comment.igCommentId,
      text: m.comment.text.slice(0, 1000),
      at: m.comment.at,
    })),
    skipDuplicates: true,
  });

  // Одна заявка на человека и слово; если нашли более раннее касание — источник переносим на него
  let newLeads = 0;
  const earliest = new Map<string, (typeof matches)[number]>();
  for (const m of fresh) {
    const key = `${m.keywordId}|${m.handle}`;
    const prev = earliest.get(key);
    if (!prev || m.comment.at < prev.comment.at) earliest.set(key, m);
  }
  for (const m of earliest.values()) {
    const existing = await prisma.lead.findFirst({
      where: { projectId: project.projectId, keywordId: m.keywordId, handle: m.handle },
      select: { id: true, firstTouchAt: true },
    });
    if (!existing) {
      const createdLead = await prisma.lead
        .create({
        data: {
          workspaceId: project.workspaceId,
          projectId: project.projectId,
          keywordId: m.keywordId,
          publicationId: m.publicationId,
          handle: m.handle,
          source: "COMMENT",
          firstTouchAt: m.comment.at,
          note: m.comment.text.slice(0, 500),
        },
        })
        // Параллельное обновление уже создало эту заявку — не ошибка
        .catch((error: unknown) => {
          if ((error as { code?: string }).code === "P2002") return null;
          throw error;
        });
      if (createdLead) newLeads += 1;
    } else if (m.comment.at < existing.firstTouchAt) {
      // Известный источник не затираем пустым
      await prisma.lead.update({
        where: { id: existing.id },
        data: { firstTouchAt: m.comment.at, ...(m.publicationId ? { publicationId: m.publicationId } : {}) },
      });
    }
  }
  return { mentions: created.count, newLeads };
}
