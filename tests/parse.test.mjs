import assert from 'node:assert/strict';
import test from 'node:test';
import { isChatModel, modelKey } from '../scripts/model-key.mjs';
import { parsePricing, rechargeRate } from '../scripts/new-api.mjs';

test('model names from different sites meet on one key', () => {
  assert.equal(modelKey('anthropic/claude-opus-4.8'), 'claude-opus-4-8');
  assert.equal(modelKey('[限时]claude-opus-4-8-20260901'), 'claude-opus-4-8');
  assert.equal(modelKey('限时/GPT-5.6-Sol'), 'gpt-5-6-sol');
  assert.equal(modelKey('deepseek/deepseek-v4-flash:free'), 'deepseek-v4-flash');
  assert.equal(isChatModel('gpt-image-2'), false);
  assert.equal(isChatModel('kimi-k3'), true);
});

test('recharge rate only trusts believable site values', () => {
  assert.deepEqual(rechargeRate({ data: { price: 1 } }, {}), { rate: 1, known: true });
  assert.deepEqual(rechargeRate({ data: { price: 0.01 } }, {}), { rate: 1, known: false });
  assert.deepEqual(rechargeRate({ data: { price: 0.01 } }, { rechargeRate: 0.7 }), { rate: 0.7, known: true });
});

test('cheapest usable group wins, priced in yuan per million tokens', () => {
  const offers = parsePricing({
    data: [
      { model_name: 'claude-opus-4-8', quota_type: 0, model_ratio: 7.5, completion_ratio: 5, enable_groups: ['default', 'cheap', '测试'] },
      { model_name: 'gpt-image-2', quota_type: 1, model_price: 0.1, enable_groups: ['default'] },
      { model_name: 'kimi-k3', quota_type: 1, model_price: 0.02, enable_groups: ['default'] },
    ],
    group_ratio: { default: 1, cheap: 0.5, 测试: 0.01 },
    usable_group: { cheap: '特价' },
  }, { rate: 2, known: true });
  assert.deepEqual(offers['claude-opus-4-8'], { mode: 'token', input: 15, output: 75, group: 'cheap（特价）' });
  assert.equal(offers['gpt-image-2'], undefined);
  assert.deepEqual(offers['kimi-k3'], { mode: 'call', perCall: 0.04, group: 'default' });
});
