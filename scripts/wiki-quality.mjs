import { readFile } from "node:fs/promises";

const PLACEHOLDERS = [/tbd/i, /coming soon/i, /check back/i, /not confirmed/i, /待补充/, /敬请期待/];

export async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

export function auditWiki(wiki) {
  const errors = [];
  if (!wiki.slug) errors.push("missing slug");
  if (!['draft', 'review', 'published'].includes(wiki.publishStatus)) errors.push("invalid publishStatus");
  const content = wiki.content?.en;
  if (!content) errors.push("missing English content");
  if (!content?.summary || content.summary.trim().length < 120) errors.push("English summary must be at least 120 characters");
  if ((content?.faq?.length || 0) < 2) errors.push("at least 2 English FAQs are required");
  for (const [i, faq] of (content?.faq || []).entries()) {
    if (!faq.question?.trim()) errors.push(`FAQ ${i + 1}: missing question`);
    if (!faq.answer || faq.answer.trim().length < 40) errors.push(`FAQ ${i + 1}: answer must be at least 40 characters`);
    if (PLACEHOLDERS.some((rule) => rule.test(faq.answer || ""))) errors.push(`FAQ ${i + 1}: placeholder language detected`);
  }
  if ((content?.sources?.length || 0) < 1) errors.push("at least 1 source is required");
  for (const [i, source] of (content?.sources || []).entries()) {
    if (!source.label || !/^https:\/\//.test(source.url || "")) errors.push(`source ${i + 1}: label and HTTPS URL required`);
  }
  return errors;
}
