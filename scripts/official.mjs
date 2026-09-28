// Official list prices, read from OpenRouter's public model list (it resells first-party models at the maker's
// list price), and today's USD→CNY rate from a free public source.

import { getJson, round } from './http.mjs';
import { isChatModel, modelKey, OFFICIAL_PREFIXES } from './model-key.mjs';

const FALLBACK_USD_CNY = 7.1;

export async function readExchangeRate() {
  const result = await getJson('https://open.er-api.com/v6/latest/USD');
  const rate = Number(result.value?.rates?.CNY);
  return Number.isFinite(rate) && rate > 5 && rate < 10
    ? { usdCny: round(rate, 4), source: 'open.er-api.com' }
    : { usdCny: FALLBACK_USD_CNY, source: '备用汇率' };
}

export async function readOfficialPrices(usdCny) {
  const result = await getJson('https://openrouter.ai/api/v1/models');
  const rows = Array.isArray(result.value?.data) ? result.value.data : [];
  const official = {};
  for (const row of rows) {
    const id = String(row?.id ?? '');
    const maker = id.split('/')[0];
    if (!OFFICIAL_PREFIXES.has(maker) || id.includes(':') || id.startsWith('~')) continue;
    const key = modelKey(id);
    const input = Number(row?.pricing?.prompt) * 1e6;
    const output = Number(row?.pricing?.completion) * 1e6;
    if (!key || !isChatModel(key) || !(input > 0) || !(output > 0) || official[key] !== undefined) continue;
    official[key] = {
      name: String(row.name ?? id).replace(/^[^:]+:\s*/u, ''),
      inputUsd: round(input), outputUsd: round(output),
      input: round(input * usdCny), output: round(output * usdCny),
    };
  }
  return { ok: rows.length > 0, official, error: result.error };
}
