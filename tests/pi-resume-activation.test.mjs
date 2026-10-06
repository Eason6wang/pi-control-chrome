import assert from "node:assert/strict";
import test from "node:test";

// Default lazy mode: browser tools start hidden until the user asks for browser control.
delete process.env.PI_CONTROL_CHROME_LAZY_TOOLS;
process.env.PI_CONTROL_CHROME_BRIDGE_PORT = String(19_000 + Math.floor(Math.random() * 300));

const { default: piControlChrome } = await import("../pi-extension/index.ts");
const { BROWSER_TOOL_NAMES } = await import("../pi-extension/activation.js");

function createHarness(branch) {
  const listeners = new Map();
  let activeTools = ["read", "bash"];
  const pi = {
    registerTool() {},
    registerCommand() {},
    on(name, listener) {
      listeners.set(name, [...(listeners.get(name) ?? []), listener]);
    },
    getActiveTools: () => [...activeTools],
    setActiveTools: (names) => {
      activeTools = [...names];
    },
  };
  const ctx = { ui: { setStatus() {}, notify() {} }, sessionManager: { getBranch: () => branch } };
  piControlChrome(pi);
  return {
    activeTools: () => activeTools,
    async emit(name, event = {}) {
      for (const listener of listeners.get(name) ?? []) await listener(event, ctx);
    },
  };
}

const system = (message) => ({ type: "message", message: { role: "system", content: "", timestamp: 0, ...message } });
const declared = (name) => ({ name, description: name, parameters: { type: "object", properties: {} } });

test("a new thread starts with browser tools hidden", async () => {
  const harness = createHarness([system({ toolsAdded: [declared("read"), declared("bash")] })]);
  await harness.emit("session_start", { type: "session_start", reason: "new" });
  assert.deepEqual(harness.activeTools(), ["read", "bash"]);
});

test("a resumed or forked thread that used the browser keeps its browser tools", async () => {
  const branch = [
    system({ toolsAdded: [declared("read"), declared("bash")] }),
    { type: "message", message: { role: "user", content: "use my browser", timestamp: 1 } },
    system({ toolsAdded: BROWSER_TOOL_NAMES.map(declared) }),
  ];
  for (const reason of ["resume", "fork", "reload"]) {
    const harness = createHarness(branch);
    await harness.emit("session_start", { type: "session_start", reason });
    assert.deepEqual(harness.activeTools(), ["read", "bash", ...BROWSER_TOOL_NAMES], reason);
  }
});

test("a thread whose browser context was reset stays hidden on resume", async () => {
  const harness = createHarness([
    system({ toolsAdded: [declared("read"), ...BROWSER_TOOL_NAMES.map(declared)] }),
    system({ toolsRemoved: BROWSER_TOOL_NAMES.map((name) => ({ name })) }),
  ]);
  await harness.emit("session_start", { type: "session_start", reason: "resume" });
  assert.deepEqual(harness.activeTools(), ["read", "bash"]);
});
