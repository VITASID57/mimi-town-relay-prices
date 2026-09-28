// Daily run: read every listed site and the official prices, then write data/prices.json for the town.
// A site that fails keeps its last good prices (marked with that date) for up to 2 more days; after the
// third failed day in a row it is delisted until it answers again.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { mapLimit } from './http.mjs';
import { vendorOf } from './model-key.mjs';
import { readSite } from './new-api.mjs';
import { readExchangeRate, readOfficialPrices } from './official.mjs';

const DELIST_AFTER = 3;
const root = new URL('../', import.meta.url);
const today = new Date().toISOString().slice(0, 10);

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(new URL(path, root), 'utf8')); } catch { return fallback; }
}
async function writeJson(path, value) {
  await writeFile(new URL(path, root), `${JSON.stringify(value, null, 1)}\n`);
}

async function refreshSites(sites, state) {
  await mkdir(new URL('data/sites/', root), { recursive: true });
  return mapLimit(sites, 6, async (site) => {
    const previous = state.sites?.[site.id] ?? {};
    const result = await readSite(site);
    if (result.ok) {
      const snapshot = { checkedAt: today, recharge: result.recharge, offers: result.offers };
      await writeJson(`data/sites/${site.id}.json`, snapshot);
      return { site, snapshot, record: { lastOkAt: today, failStreak: 0 } };
    }
    const failStreak = (previous.failStreak ?? 0) + 1;
    const record = { lastOkAt: previous.lastOkAt ?? null, failStreak, lastError: result.error };
    const snapshot = failStreak < DELIST_AFTER ? await readJson(`data/sites/${site.id}.json`, null) : null;
    return { site, snapshot, record };
  });
}

function collectModels(results, official) {
  const byKey = new Map();
  for (const { site, snapshot } of results) {
    if (snapshot === null) continue;
    for (const [key, offer] of Object.entries(snapshot.offers)) {
      const list = byKey.get(key) ?? [];
      list.push({ site: site.id, ...offer });
      byKey.set(key, list);
    }
  }
  const models = [];
  for (const [key, offers] of byKey) {
    const price = official[key] ?? null;
    if (price === null && offers.length < 3) continue;
    offers.sort((left, right) => (left.mode === right.mode ? 0 : left.mode === 'token' ? -1 : 1)
      || (left.input ?? left.perCall) - (right.input ?? right.perCall));
    const vendor = vendorOf(key);
    models.push({
      key, vendor: vendor?.label ?? '', name: price?.name ?? key, official: price,
      offers: offers.map((offer) => price !== null && offer.mode === 'token'
        ? { ...offer, ratio: Math.round((offer.input / price.input) * 100) / 100 } : offer),
    });
  }
  const vendorOrder = ['GPT', 'Claude', 'Gemini', 'Grok', 'DeepSeek', 'Kimi', 'GLM', 'Qwen'];
  return models.sort((left, right) => vendorOrder.indexOf(left.vendor) - vendorOrder.indexOf(right.vendor)
    || right.offers.length - left.offers.length || left.key.localeCompare(right.key));
}

async function main() {
  const { sites } = await readJson('sites.json', { sites: [] });
  const state = await readJson('data/state.json', { sites: {} });
  const fx = await readExchangeRate();
  const officialResult = await readOfficialPrices(fx.usdCny);
  const results = await refreshSites(sites, state);
  const nextState = { updatedAt: today, sites: Object.fromEntries(results.map(({ site, record }) => [site.id, record])) };
  await writeJson('data/state.json', nextState);
  await writeJson('data/prices.json', {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    unit: '元 / 百万 token；按次模型为元 / 次',
    fx,
    officialSource: officialResult.ok ? 'OpenRouter 公开价目（官方原价）' : '本次未读到官方价',
    sites: results.filter(({ snapshot }) => snapshot !== null).map(({ site, snapshot }) => ({
      id: site.id, name: site.name, url: site.url, checkedAt: snapshot.checkedAt,
      stale: snapshot.checkedAt !== today, recharge: snapshot.recharge, modelCount: Object.keys(snapshot.offers).length,
    })),
    delisted: results.filter(({ snapshot }) => snapshot === null)
      .map(({ site, record }) => ({ id: site.id, name: site.name, lastOkAt: record.lastOkAt })),
    models: collectModels(results, officialResult.official),
  });
  const listed = results.filter(({ snapshot }) => snapshot !== null).length;
  console.log(`sites listed ${listed}/${sites.length}; official ${Object.keys(officialResult.official).length}; fx ${fx.usdCny}`);
}

await main();
