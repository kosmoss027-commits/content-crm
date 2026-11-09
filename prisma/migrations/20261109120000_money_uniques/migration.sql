-- Один комментарий может содержать несколько кодовых слов
DROP INDEX "KeywordMention_projectId_igCommentId_key";
CREATE UNIQUE INDEX "KeywordMention_projectId_igCommentId_keywordId_key" ON "KeywordMention"("projectId", "igCommentId", "keywordId");

-- Одна заявка на человека и слово (защита от одновременного обновления)
CREATE UNIQUE INDEX "Lead_projectId_keywordId_handle_key" ON "Lead"("projectId", "keywordId", "handle");
