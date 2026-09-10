import { addCalendarDays } from './schedulePlanning.ts';
/** Missing terms are unavailable; explicit negative terms are clamped to due-on-document-date for legacy contract compatibility. */
export function dueDateFromTerms(documentDate: string | null | undefined, paymentTermsDays: unknown): string | null {
  if (!documentDate || paymentTermsDays === null || paymentTermsDays === undefined || paymentTermsDays === '') return null;
  const terms = Number(paymentTermsDays);
  if (!Number.isFinite(terms)) return null;
  return addCalendarDays(documentDate, Math.max(0, Math.round(terms)));
}
