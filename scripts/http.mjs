const TIMEOUT_MS = 20_000;
const MAX_BYTES = 8_000_000;

/** GET a JSON document; null on any failure so one broken site never stops the run. */
export async function getJson(url) {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'mimi-town-relay-prices (+https://github.com/VITASID57/mimi-town-relay-prices)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { error: `HTTP ${response.status}` };
    const text = await response.text();
    if (text.length > MAX_BYTES) return { error: '返回内容过大' };
    return { value: JSON.parse(text) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export function round(value, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
