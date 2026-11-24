import assert from "node:assert/strict";
import test from "node:test";

process.env.PI_CONTROL_CHROME_BRIDGE_PORT = String(19_100 + Math.floor(Math.random() * 300));
process.env.PI_CONTROL_CHROME_LAZY_TOOLS = "true";

const { default: piControlChrome } = await import("../pi-extension/index.ts");

function createHarness() {
  const listeners = new Map();
  let activeTools = ["read", "bash"];
  const pi = {
    registerTool() {},
    registerCommand() {},
    on(name, listener) {
      listeners.set(name, [...(listeners.get(name) ?? []), listener]);
    },
    getActiveTools: () => [...activeTools],
    setActiveTools(names) { activeTools = [...names]; },
  };
  piControlChrome(pi);
  const ctx = { ui: { setStatus() {}, notify() {} } };
  return {
    active: () => activeTools.includes("browser_status"),
    async emit(name, event = {}) {
      for (const listener of listeners.get(name) ?? []) await listener(event, ctx);
    },
  };
}

const readResult = (path) => ({ toolName: "read", isError: false, input: { path } });

test("reading the skill activates browser tools when the run had no before_agent_start", async () => {
  const harness = createHarness();
  await harness.emit("session_start");
  assert.equal(harness.active(), false);
  await harness.emit("tool_result", readResult("/Users/me/Development/pi-control-chrome/skills/pi-control-chrome/SKILL.md"));
  assert.equal(harness.active(), true);
});

test("other files, including the release skill, do not activate browser tools", async () => {
  const harness = createHarness();
  await harness.emit("session_start");
  await harness.emit("tool_result", readResult("/repo/skills/pi-control-chrome-release/SKILL.md"));
  await harness.emit("tool_result", readResult("/repo/skills/pi-control-chrome/references/recipes.md"));
  assert.equal(harness.active(), false);
});

test("a skill path announced in before_agent_start still activates", async () => {
  const harness = createHarness();
  await harness.emit("session_start");
  await harness.emit("before_agent_start", { prompt: "hi", systemPromptOptions: { skills: [{ name: "pi-control-chrome", filePath: "/custom/browser.md" }] } });
  await harness.emit("tool_result", readResult("/custom/browser.md"));
  assert.equal(harness.active(), true);
});
