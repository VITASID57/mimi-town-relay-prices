// One name per model, so "anthropic/claude-opus-4.8", "[限时]claude-opus-4-8" and "claude-opus-4-8-20260901"
// on different sites all land on the same row.

const VENDORS = [
  { id: 'openai', label: 'GPT', match: /^(?:gpt|o\d|chatgpt)/u },
  { id: 'anthropic', label: 'Claude', match: /^claude/u },
  { id: 'x-ai', label: 'Grok', match: /^grok/u },
  { id: 'google', label: 'Gemini', match: /^gemini/u },
  { id: 'moonshotai', label: 'Kimi', match: /^kimi/u },
  { id: 'deepseek', label: 'DeepSeek', match: /^deepseek/u },
  { id: 'z-ai', label: 'GLM', match: /^glm/u },
  { id: 'qwen', label: 'Qwen', match: /^qwen/u },
];

/** OpenRouter vendor prefixes that are the model maker itself (their list price is the official price). */
export const OFFICIAL_PREFIXES = new Set(['openai', 'anthropic', 'x-ai', 'google', 'moonshotai', 'deepseek', 'z-ai', 'qwen']);

export function modelKey(raw) {
  let name = String(raw ?? '').trim().toLowerCase();
  name = name.replace(/^(?:\[[^\]]*\]|【[^】]*】|\([^)]*\))\s*/u, '');
  if (name.includes('/')) name = name.slice(name.lastIndexOf('/') + 1);
  name = name.replace(/:.*$/u, '');
  name = name.replace(/[._\s]+/gu, '-').replace(/-(?:\d{8}|\d{4}-\d{2}-\d{2})$/u, '');
  return name.replace(/-+/gu, '-').replace(/^-|-$/gu, '');
}

export function vendorOf(key) {
  return VENDORS.find((vendor) => vendor.match.test(key)) ?? null;
}

/** Image, video, audio and embedding models are priced per call or per second; they stay out of token comparison. */
export function isChatModel(key) {
  return vendorOf(key) !== null && !/(?:image|imagen|veo|sora|tts|whisper|embedding|audio|realtime|dall-e|search-preview)/u.test(key);
}
