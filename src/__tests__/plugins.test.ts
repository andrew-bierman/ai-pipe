import { describe, expect, mock, test } from "bun:test";
import {
  type AfterResponseContext,
  type BeforeRequestContext,
  type Plugin,
  PluginConfigSchema,
  PluginManager,
} from "../plugins.ts";

// ── PluginConfigSchema ─────────────────────────────────────────────

describe("PluginConfigSchema", () => {
  test("validates correct config", () => {
    const config = [
      { path: "./my-plugin.ts", enabled: true },
      { path: "./other-plugin.js", enabled: false, options: { key: "value" } },
    ];
    const result = PluginConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  test("defaults enabled to true when omitted", () => {
    const config = [{ path: "./my-plugin.ts" }];
    const result = PluginConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]?.enabled).toBe(true);
    }
  });

  test("rejects invalid config (missing path)", () => {
    const config = [{ enabled: true }];
    const result = PluginConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  test("rejects non-array config", () => {
    const config = { path: "./my-plugin.ts", enabled: true };
    const result = PluginConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  test("validates empty array", () => {
    const result = PluginConfigSchema.safeParse([]);
    expect(result.success).toBe(true);
  });
});

// ── PluginManager ──────────────────────────────────────────────────

describe("PluginManager", () => {
  test("starts with no loaded plugins", () => {
    const manager = new PluginManager();
    expect(manager.getLoadedPlugins()).toEqual([]);
  });

  test("addPlugin adds a plugin", () => {
    const manager = new PluginManager();
    manager.addPlugin({ name: "test-plugin" });
    expect(manager.getLoadedPlugins()).toEqual(["test-plugin"]);
  });

  test("getLoadedPlugins returns names with version", () => {
    const manager = new PluginManager();
    manager.addPlugin({ name: "alpha", version: "1.0.0" });
    manager.addPlugin({ name: "beta" });
    manager.addPlugin({ name: "gamma", version: "2.3.1" });
    expect(manager.getLoadedPlugins()).toEqual([
      "alpha v1.0.0",
      "beta",
      "gamma v2.3.1",
    ]);
  });

  test("plugin without hooks is valid (name-only plugin)", () => {
    const manager = new PluginManager();
    const plugin: Plugin = { name: "noop-plugin" };
    manager.addPlugin(plugin);
    expect(manager.getLoadedPlugins()).toEqual(["noop-plugin"]);
  });
});

// ── PluginManager.beforeRequest ────────────────────────────────────

describe("PluginManager.beforeRequest", () => {
  test("returns original prompt when no plugins have beforeRequest", async () => {
    const manager = new PluginManager();
    manager.addPlugin({ name: "noop" });
    const result = await manager.beforeRequest({
      prompt: "hello",
      model: "openai/gpt-4o",
    });
    expect(result).toBe("hello");
  });

  test("transforms prompt with a single plugin", async () => {
    const manager = new PluginManager();
    manager.addPlugin({
      name: "prefix-plugin",
      beforeRequest: ({ prompt }) => `[PREFIX] ${prompt}`,
    });
    const result = await manager.beforeRequest({
      prompt: "hello",
      model: "openai/gpt-4o",
    });
    expect(result).toBe("[PREFIX] hello");
  });

  test("chains multiple plugins in order", async () => {
    const manager = new PluginManager();
    manager.addPlugin({
      name: "first",
      beforeRequest: ({ prompt }) => `[1:${prompt}]`,
    });
    manager.addPlugin({
      name: "second",
      beforeRequest: ({ prompt }) => `[2:${prompt}]`,
    });
    const result = await manager.beforeRequest({
      prompt: "hello",
      model: "openai/gpt-4o",
    });
    expect(result).toBe("[2:[1:hello]]");
  });

  test("passes model and system in context", async () => {
    const manager = new PluginManager();
    let capturedContext: BeforeRequestContext | undefined;
    manager.addPlugin({
      name: "spy",
      beforeRequest: (ctx) => {
        capturedContext = ctx;
        return ctx.prompt;
      },
    });
    await manager.beforeRequest({
      prompt: "test",
      model: "anthropic/claude-sonnet-4-5",
      system: "Be helpful",
    });
    expect(capturedContext?.model).toBe("anthropic/claude-sonnet-4-5");
    expect(capturedContext?.system).toBe("Be helpful");
  });

  test("supports async beforeRequest hooks", async () => {
    const manager = new PluginManager();
    manager.addPlugin({
      name: "async-plugin",
      beforeRequest: async ({ prompt }) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return `async:${prompt}`;
      },
    });
    const result = await manager.beforeRequest({
      prompt: "hello",
      model: "openai/gpt-4o",
    });
    expect(result).toBe("async:hello");
  });
});

// ── PluginManager.afterResponse ────────────────────────────────────

describe("PluginManager.afterResponse", () => {
  test("returns original text when no plugins have afterResponse", async () => {
    const manager = new PluginManager();
    manager.addPlugin({ name: "noop" });
    const result = await manager.afterResponse({
      text: "world",
      model: "openai/gpt-4o",
    });
    expect(result).toBe("world");
  });

  test("transforms text with a single plugin", async () => {
    const manager = new PluginManager();
    manager.addPlugin({
      name: "upper",
      afterResponse: ({ text }) => text.toUpperCase(),
    });
    const result = await manager.afterResponse({
      text: "hello world",
      model: "openai/gpt-4o",
    });
    expect(result).toBe("HELLO WORLD");
  });

  test("chains multiple plugins in order", async () => {
    const manager = new PluginManager();
    manager.addPlugin({
      name: "wrap",
      afterResponse: ({ text }) => `<${text}>`,
    });
    manager.addPlugin({
      name: "upper",
      afterResponse: ({ text }) => text.toUpperCase(),
    });
    const result = await manager.afterResponse({
      text: "hello",
      model: "openai/gpt-4o",
    });
    expect(result).toBe("<HELLO>");
  });

  test("passes model and usage in context", async () => {
    const manager = new PluginManager();
    let capturedContext: AfterResponseContext | undefined;
    manager.addPlugin({
      name: "spy",
      afterResponse: (ctx) => {
        capturedContext = ctx;
        return ctx.text;
      },
    });
    await manager.afterResponse({
      text: "test",
      model: "openai/gpt-4o",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });
    expect(capturedContext?.model).toBe("openai/gpt-4o");
    expect(capturedContext?.usage?.inputTokens).toBe(10);
    expect(capturedContext?.usage?.outputTokens).toBe(5);
    expect(capturedContext?.usage?.totalTokens).toBe(15);
  });

  test("supports async afterResponse hooks", async () => {
    const manager = new PluginManager();
    manager.addPlugin({
      name: "async-plugin",
      afterResponse: async ({ text }) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return `async:${text}`;
      },
    });
    const result = await manager.afterResponse({
      text: "hello",
      model: "openai/gpt-4o",
    });
    expect(result).toBe("async:hello");
  });
});

// ── PluginManager.cleanup ──────────────────────────────────────────

describe("PluginManager.cleanup", () => {
  test("calls cleanup on all plugins", async () => {
    const manager = new PluginManager();
    const cleanupFn1 = mock(() => {});
    const cleanupFn2 = mock(() => {});
    manager.addPlugin({ name: "a", cleanup: cleanupFn1 });
    manager.addPlugin({ name: "b", cleanup: cleanupFn2 });
    await manager.cleanup();
    expect(cleanupFn1).toHaveBeenCalledTimes(1);
    expect(cleanupFn2).toHaveBeenCalledTimes(1);
  });

  test("does not fail when plugins have no cleanup hook", async () => {
    const manager = new PluginManager();
    manager.addPlugin({ name: "noop" });
    await manager.cleanup(); // should not throw
  });

  test("supports async cleanup hooks", async () => {
    const manager = new PluginManager();
    let cleaned = false;
    manager.addPlugin({
      name: "async-cleanup",
      cleanup: async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        cleaned = true;
      },
    });
    await manager.cleanup();
    expect(cleaned).toBe(true);
  });
});

// ── PluginManager.loadPlugins ──────────────────────────────────────

describe("PluginManager.loadPlugins", () => {
  test("throws when config file does not exist", async () => {
    const manager = new PluginManager();
    await expect(
      manager.loadPlugins("/nonexistent/plugins.json"),
    ).rejects.toThrow("Plugin config not found");
  });
});

// ── Integration: full lifecycle ────────────────────────────────────

describe("Plugin lifecycle", () => {
  test("full lifecycle: init -> beforeRequest -> afterResponse -> cleanup", async () => {
    const callOrder: string[] = [];
    const plugin: Plugin = {
      name: "lifecycle-plugin",
      version: "1.0.0",
      init: () => {
        callOrder.push("init");
      },
      beforeRequest: ({ prompt }) => {
        callOrder.push("beforeRequest");
        return `modified:${prompt}`;
      },
      afterResponse: ({ text }) => {
        callOrder.push("afterResponse");
        return `result:${text}`;
      },
      cleanup: () => {
        callOrder.push("cleanup");
      },
    };

    const manager = new PluginManager();
    // Simulate what loadPlugins does: call init, then add
    if (plugin.init) plugin.init();
    manager.addPlugin(plugin);

    const prompt = await manager.beforeRequest({
      prompt: "test",
      model: "openai/gpt-4o",
    });
    expect(prompt).toBe("modified:test");

    const text = await manager.afterResponse({
      text: "response",
      model: "openai/gpt-4o",
    });
    expect(text).toBe("result:response");

    await manager.cleanup();

    expect(callOrder).toEqual([
      "init",
      "beforeRequest",
      "afterResponse",
      "cleanup",
    ]);
    expect(manager.getLoadedPlugins()).toEqual(["lifecycle-plugin v1.0.0"]);
  });
});
