import test from 'node:test';
import assert from 'node:assert/strict';
import { BROWSER_TOOL_NAMES, applyBrowserToolMask, createBrowserActivation, transcriptHasBrowserTools } from '../pi-extension/activation.js';

test('Pi browser activation starts hidden and masks only browser tools', () => {
  const activation = createBrowserActivation();
  const calls = [];
  const api = {
    getActiveTools: () => ['read', 'browser_status', 'write'],
    setActiveTools: names => calls.push(names),
  };
  applyBrowserToolMask(api, activation.active);
  assert.deepEqual(calls, [['read', 'write']]);
  assert.equal(activation.active, false);
});

test('Pi Skill activation exposes all browser tools and does not drop ordinary tools', () => {
  const activation = createBrowserActivation();
  const calls = [];
  const api = {
    getActiveTools: () => ['read', 'write'],
    setActiveTools: names => calls.push(names),
  };
  activation.setActive(true);
  applyBrowserToolMask(api, activation.active);
  assert.deepEqual(calls[0], ['read', 'write', ...BROWSER_TOOL_NAMES]);
  assert.equal(new Set(calls[0]).size, 2 + BROWSER_TOOL_NAMES.length);
});

test('Pi activation clears cleanup state without deactivation', () => {
  const activation = createBrowserActivation();
  activation.setActive(true);
  activation.markUsed();
  assert.equal(activation.used, true);
  assert.equal(activation.cleanupRequired, true);
  activation.clearUsed();
  assert.equal(activation.active, true);
  assert.equal(activation.used, false);
  assert.equal(activation.cleanupRequired, true);
  activation.finalize();
  assert.equal(activation.active, true);
  assert.equal(activation.used, false);
  assert.equal(activation.cleanupRequired, false);
  activation.markUsed();
  activation.reset();
  assert.equal(activation.active, false);
  assert.equal(activation.used, false);
  assert.equal(activation.cleanupRequired, false);
});

const systemEntry = (message) => ({ type: 'message', message: { role: 'system', content: '', timestamp: 0, ...message } });
const tool = name => ({ name, description: name, parameters: { type: 'object', properties: {} } });

test('Pi transcript replay keeps browser tools that a thread already activated', () => {
  assert.equal(transcriptHasBrowserTools(undefined), false);
  assert.equal(transcriptHasBrowserTools([systemEntry({ toolsAdded: [tool('read'), tool('write')] })]), false);
  const activated = [
    systemEntry({ toolsAdded: [tool('read')] }),
    { type: 'message', message: { role: 'user', content: 'use my browser', timestamp: 1 } },
    systemEntry({ toolsAdded: BROWSER_TOOL_NAMES.map(tool) }),
  ];
  assert.equal(transcriptHasBrowserTools(activated), true);
  // browser_context_reset hides them again, and that later change wins.
  const reset = [...activated, systemEntry({ toolsRemoved: BROWSER_TOOL_NAMES.map(name => ({ name })) })];
  assert.equal(transcriptHasBrowserTools(reset), false);
});
