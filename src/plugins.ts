import { z } from "zod";

/**
 * Context passed to the beforeRequest plugin hook.
 */
export interface BeforeRequestContext {
  prompt: string;
  model: string;
  system?: string;
}

/**
 * Context passed to the afterResponse plugin hook.
 */
export interface AfterResponseContext {
  text: string;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

/**
 * Plugin hook interface — plugins can implement any of these hooks.
 *
 * At minimum, a plugin must export a `name` property.
 */
export interface Plugin {
  name: string;
  version?: string;

  /** Transform the prompt before sending to the model */
  beforeRequest?: (context: BeforeRequestContext) => Promise<string> | string;

  /** Transform the response text after receiving from the model */
  afterResponse?: (context: AfterResponseContext) => Promise<string> | string;

  /** Called when the plugin is loaded */
  init?: () => Promise<void> | void;

  /** Called when the CLI exits */
  cleanup?: () => Promise<void> | void;
}

/** Schema for plugin config in ~/.ai-pipe/plugins.json */
export const PluginConfigSchema = z.array(
  z.object({
    path: z.string(),
    enabled: z.boolean().default(true),
    options: z.record(z.string(), z.unknown()).optional(),
  }),
);

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

/**
 * Plugin manager that loads and runs plugins.
 *
 * Plugins are loaded from a JSON config file and executed in order.
 * Each plugin can hook into the request/response lifecycle to transform
 * prompts and outputs.
 */
export class PluginManager {
  private plugins: Plugin[] = [];

  /**
   * Load plugins from a JSON config file.
   *
   * The config file should contain an array of plugin entries, each with
   * a `path` to the plugin module, an `enabled` flag, and optional `options`.
   * Disabled plugins are skipped. Each loaded plugin's `init` hook is called
   * if present.
   *
   * @param configPath - Absolute or relative path to the plugins config JSON file.
   * @throws If the config file does not exist or fails validation.
   * @throws If a plugin module does not export a `name` property.
   */
  async loadPlugins(configPath: string): Promise<void> {
    const file = Bun.file(configPath);
    if (!(await file.exists())) {
      throw new Error(`Plugin config not found: ${configPath}`);
    }
    const raw = await file.json();
    const configs = PluginConfigSchema.parse(raw);

    for (const config of configs) {
      if (!config.enabled) continue;
      const plugin = await import(config.path);
      const p: Plugin = plugin.default || plugin;
      if (!p.name) {
        throw new Error(
          `Plugin at ${config.path} must export a 'name' property`,
        );
      }
      if (p.init) await p.init();
      this.plugins.push(p);
    }
  }

  /**
   * Add a plugin instance directly (useful for testing).
   *
   * @param plugin - A plugin object conforming to the Plugin interface.
   */
  addPlugin(plugin: Plugin): void {
    this.plugins.push(plugin);
  }

  /**
   * Run all beforeRequest hooks in order, transforming the prompt.
   *
   * Each plugin's beforeRequest hook receives the current prompt and can
   * return a modified version. Plugins are called in the order they were loaded.
   *
   * @param context - The before-request context containing prompt, model, and system.
   * @returns The transformed prompt string.
   */
  async beforeRequest(context: BeforeRequestContext): Promise<string> {
    let prompt = context.prompt;
    for (const plugin of this.plugins) {
      if (plugin.beforeRequest) {
        prompt = await plugin.beforeRequest({ ...context, prompt });
      }
    }
    return prompt;
  }

  /**
   * Run all afterResponse hooks in order, transforming the response text.
   *
   * Each plugin's afterResponse hook receives the current text and can
   * return a modified version. Plugins are called in the order they were loaded.
   *
   * @param context - The after-response context containing text, model, and usage.
   * @returns The transformed response text.
   */
  async afterResponse(context: AfterResponseContext): Promise<string> {
    let text = context.text;
    for (const plugin of this.plugins) {
      if (plugin.afterResponse) {
        text = await plugin.afterResponse({ ...context, text });
      }
    }
    return text;
  }

  /**
   * Call all plugin cleanup hooks.
   *
   * Should be called when the CLI exits to allow plugins to release resources.
   */
  async cleanup(): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.cleanup) await plugin.cleanup();
    }
  }

  /**
   * Get a list of loaded plugin names with optional version info.
   *
   * @returns An array of strings like "my-plugin v1.0.0" or "my-plugin".
   */
  getLoadedPlugins(): string[] {
    return this.plugins.map(
      (p) => `${p.name}${p.version ? ` v${p.version}` : ""}`,
    );
  }
}
