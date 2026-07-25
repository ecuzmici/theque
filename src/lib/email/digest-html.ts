/**
 * The weekly letter's HTML, kept out of the route so it can be rendered and
 * asserted on without a request, a cron secret, or a mail provider.
 *
 * Email HTML rules apply: tables for layout, inline styles only, no <style>
 * block, no external CSS, no JavaScript. The visual language matches the rest
 * of thèque — serif on a warm paper background, amber accent.
 *
 * Every interpolated value goes through `escapeHtml`. Titles come from scraped
 * pages, so they are attacker-influenced text; the recommendation card's copy
 * comes from an LLM. Neither is trusted markup.
 */

import { formatDateMedium } from "@/lib/format-timestamp";
import { formatCategory } from "@/lib/item-labels";

import type { DigestLetter, DigestRatingPrompt } from "@/lib/email/digest-letter";

const PAPER = "#faf6ef";
const INK = "#1c1917";
const MUTED = "#78716c";
const RULE = "#e7e0d6";
const ACCENT = "#b45309";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function itemLabel(item: { title: string | null; domain: string }): string {
  return item.title?.trim() ? item.title.trim() : item.domain;
}

function sectionHeading(text: string): string {
  return `<p style="margin:32px 0 8px;font-family:Georgia,serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};">${escapeHtml(text)}</p>`;
}

function renderForgotten(letter: DigestLetter): string {
  if (letter.forgotten.length === 0) return "";

  const rows = letter.forgotten
    .map((item) => {
      const title = escapeHtml(itemLabel(item));
      const meta = escapeHtml(
        `${formatCategory(item.category)} · saved ${formatDateMedium(item.created_at)}`,
      );
      return `<tr><td style="padding:12px 0;border-bottom:1px solid ${RULE};">
        <a href="${letter.appUrl}/item/${item.id}" style="color:${INK};font-size:16px;font-weight:600;text-decoration:none;">${title}</a>
        <div style="color:${MUTED};font-size:13px;margin-top:2px;">${meta}</div>
      </td></tr>`;
    })
    .join("");

  return `${sectionHeading("Still on your shelves")}
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">${rows}</table>`;
}

/**
 * Five one-tap links per item. This is the highest-value part of the letter:
 * the recommender is verdict-driven and starving, and a star tapped from an
 * inbox is a verdict captured without a login.
 */
function renderRatingPrompt(prompt: DigestRatingPrompt): string {
  const title = escapeHtml(itemLabel(prompt));
  const stars = prompt.starLinks
    .map(
      ({ stars: value, url }) =>
        `<a href="${escapeHtml(url)}" title="${value} of 5" style="display:inline-block;padding:6px 8px;font-size:24px;line-height:1;color:${ACCENT};text-decoration:none;">&#9733;</a>`,
    )
    .join("");

  return `<tr><td style="padding:14px 0;border-bottom:1px solid ${RULE};">
      <div style="color:${INK};font-size:16px;font-weight:600;">${title}</div>
      <div style="margin-top:6px;">${stars}</div>
    </td></tr>`;
}

function renderRatingPrompts(letter: DigestLetter): string {
  if (letter.ratingPrompts.length === 0) return "";

  const rows = letter.ratingPrompts.map(renderRatingPrompt).join("");
  return `${sectionHeading(
    letter.ratingPrompts.length > 1 ? "How were they?" : "How was it?",
  )}
    <p style="margin:0 0 4px;color:${MUTED};font-size:13px;">One tap saves the rating — no sign-in needed.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">${rows}</table>`;
}

function renderRecommendation(letter: DigestLetter): string {
  const card = letter.recommendation;
  if (!card) return "";

  const cover = card.cover_url
    ? `<td width="72" valign="top" style="padding-right:14px;"><img src="${escapeHtml(card.cover_url)}" width="72" alt="" style="display:block;width:72px;border-radius:4px;" /></td>`
    : "";
  const subtitle = card.subtitle.trim()
    ? `<div style="color:${MUTED};font-size:13px;margin-top:2px;">${escapeHtml(card.subtitle)}</div>`
    : "";

  return `${sectionHeading("One pick for you")}
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;"><tr>${cover}
      <td valign="top">
        <a href="${escapeHtml(card.canonical_url)}" style="color:${INK};font-size:16px;font-weight:600;text-decoration:none;">${escapeHtml(card.title)}</a>
        ${subtitle}
        <div style="color:${INK};font-size:14px;line-height:1.5;margin-top:8px;">${escapeHtml(card.reason)}</div>
      </td>
    </tr></table>`;
}

/** Subject line, chosen by the most actionable section the letter actually has. */
export function digestSubject(letter: DigestLetter): string {
  const [firstPrompt] = letter.ratingPrompts;
  if (firstPrompt) return `How was ${itemLabel(firstPrompt)}?`;

  const [firstForgotten] = letter.forgotten;
  if (firstForgotten) {
    return letter.forgotten.length > 1
      ? `${letter.forgotten.length} things still on your shelves`
      : `Still on your shelves: ${itemLabel(firstForgotten)}`;
  }

  if (letter.recommendation) return `One pick for you: ${letter.recommendation.title}`;
  return "Your thèque";
}

export function renderDigestHtml(letter: DigestLetter): string {
  const body = [
    renderForgotten(letter),
    renderRatingPrompts(letter),
    renderRecommendation(letter),
  ].join("");

  return `<!doctype html><html><body style="margin:0;background:${PAPER};font-family:Georgia,serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <h1 style="font-size:22px;color:${INK};margin:0;">thèque</h1>
    <p style="color:${MUTED};font-size:14px;margin:6px 0 0;">Your week on the shelves.</p>
    ${body}
    <p style="margin-top:28px;"><a href="${letter.appUrl}/library" style="color:${ACCENT};font-size:14px;">Open your library &rarr;</a></p>
    <p style="margin-top:24px;color:${MUTED};font-size:12px;line-height:1.6;">
      You get this letter once a week.
      <a href="${escapeHtml(letter.unsubscribeUrl)}" style="color:${MUTED};">Unsubscribe</a>
      or change the day in <a href="${letter.appUrl}/settings" style="color:${MUTED};">settings</a>.
    </p>
  </div></body></html>`;
}
