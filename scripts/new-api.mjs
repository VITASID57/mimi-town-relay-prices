// New API / One API relay sites publish /api/status (recharge price) and /api/pricing (model and group ratios).
// Prices there are in the site's own "dollar credit"; recharge price turns that into yuan actually paid.

import { getJson, round } from './http.mjs';
import { isChatModel, modelKey } from './model-key.mjs';

const SKIPPED_GROUP = /(?:测试|停用|禁用|废弃|勿选|test|deprecated|disabled)/iu;

function objectOf(value) { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}; }
function positive(value) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : null; }

/** Yuan paid for one dollar of site credit; only believable values are trusted, otherwise the site list decides. */
export function rechargeRate(status, site) {
  const fromSite = positive(objectOf(objectOf(status).data).price);
  if (fromSite !== null && fromSite >= 0.1 && fromSite <= 20) return { rate: fromSite, known: true };
  const manual = positive(site.rechargeRate);
  if (manual !== null) return { rate: manual, known: true };
  return { rate: 1, known: false };
}

function groupsOf(row, groupRatio) {
  const listed = Array.isArray(row.enable_groups) ? row.enable_groups : Array.isArray(row.enable_group) ? row.enable_group : ['default'];
  return listed.filter((group) => typeof group === 'string' && !SKIPPED_GROUP.test(group))
    .map((group) => ({ group, ratio: positive(groupRatio[group]) ?? (group === 'default' ? 1 : null) }))
    .filter((item) => item.ratio !== null);
}

/** Cheapest usable group per model, in yuan per 1M tokens (or yuan per call for per-call models). */
export function parsePricing(pricing, recharge) {
  const root = objectOf(pricing);
  const rows = Array.isArray(root.data) ? root.data : [];
  const groupRatio = objectOf(root.group_ratio);
  const labels = objectOf(root.usable_group);
  const offers = {};
  for (const raw of rows) {
    const row = objectOf(raw);
    const key = modelKey(row.model_name ?? row.model);
    if (!key || !isChatModel(key)) continue;
    const perCall = String(row.quota_type) === '1';
    for (const { group, ratio } of groupsOf(row, groupRatio)) {
      const offer = perCall
        ? priceOffer(null, null, positive(row.model_price), ratio, recharge)
        : priceOffer(positive(row.model_ratio), positive(row.completion_ratio) ?? 1, null, ratio, recharge);
      if (offer === null) continue;
      const current = offers[key];
      if (current === undefined || rank(offer) < rank(current)) {
        offers[key] = { ...offer, group: typeof labels[group] === 'string' && labels[group] ? `${group}（${labels[group]}）` : group };
      }
    }
  }
  return offers;
}

function priceOffer(modelRatio, completionRatio, callPrice, groupRatio, recharge) {
  if (callPrice !== null) return { mode: 'call', perCall: round(callPrice * groupRatio * recharge.rate) };
  if (modelRatio === null) return null;
  const input = modelRatio * 2 * groupRatio * recharge.rate;
  return { mode: 'token', input: round(input), output: round(input * completionRatio) };
}

/** Token offers sort before per-call ones; cheaper input first. */
function rank(offer) {
  return offer.mode === 'token' ? offer.input : 1e9 + offer.perCall;
}

export async function readSite(site) {
  const [status, pricing] = await Promise.all([getJson(`${site.url}/api/status`), getJson(`${site.url}/api/pricing`)]);
  if (pricing.error !== undefined) return { ok: false, error: pricing.error };
  if (objectOf(pricing.value).success === false || !Array.isArray(objectOf(pricing.value).data)) {
    return { ok: false, error: '价目接口没有返回模型清单' };
  }
  const recharge = rechargeRate(status.value, site);
  return { ok: true, recharge, offers: parsePricing(pricing.value, recharge) };
}
