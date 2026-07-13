/**
 * Provider-agnostic LLM helper for forced tool-use generation.
 *
 * Both AI features (onboarding site regeneration, post writer) need the same
 * thing: one prompt in, one schema-shaped JSON object out. This helper speaks
 * to whichever provider the deployment has a key for:
 *
 *  - ANTHROPIC_API_KEY → Anthropic Messages API (tool use)
 *  - OPENAI_API_KEY    → OpenAI Chat Completions (function calling)
 *
 * When both keys are set, LLM_PROVIDER ("anthropic" | "openai") picks one
 * (default: anthropic). LLM_MODEL overrides the per-provider default model
 * (claude-sonnet-5 / gpt-4o); ONBOARDING_MODEL is honored as a legacy alias
 * for the Anthropic model.
 *
 * Every failure path returns null — callers always have a heuristic fallback,
 * so the product flow never breaks on an API problem.
 */

import "server-only";

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the tool input — the same shape works for both providers */
  input_schema: Record<string, unknown>;
}

interface ProviderConfig {
  provider: "anthropic" | "openai";
  apiKey: string;
  model: string;
}

function resolveProvider(): ProviderConfig | null {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const preferred = process.env.LLM_PROVIDER;

  let provider: ProviderConfig["provider"] | null = null;
  if (preferred === "openai" && openaiKey) provider = "openai";
  else if (preferred === "anthropic" && anthropicKey) provider = "anthropic";
  else if (anthropicKey) provider = "anthropic";
  else if (openaiKey) provider = "openai";
  if (!provider) return null;

  const model =
    process.env.LLM_MODEL ??
    (provider === "anthropic"
      ? (process.env.ONBOARDING_MODEL ?? "claude-sonnet-5")
      : "gpt-4o");

  return {
    provider,
    apiKey: provider === "anthropic" ? anthropicKey! : openaiKey!,
    model,
  };
}

async function callAnthropic(
  config: ProviderConfig,
  prompt: string,
  tool: ToolSpec,
  maxTokens: number,
): Promise<Record<string, unknown> | null> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    console.warn(`[llm] Anthropic API ${res.status}`);
    return null;
  }
  const data = (await res.json()) as {
    content?: Array<{ type: string; input?: Record<string, unknown> }>;
  };
  return data.content?.find((c) => c.type === "tool_use")?.input ?? null;
}

async function callOpenAI(
  config: ProviderConfig,
  prompt: string,
  tool: ToolSpec,
  maxTokens: number,
): Promise<Record<string, unknown> | null> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      // reasoning models (gpt-5 / o-series) spend completion tokens thinking
      // before emitting the call — the cap must leave room for both
      max_completion_tokens: maxTokens * 3,
      tools: [
        {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: tool.name } },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    console.warn(`[llm] OpenAI API ${res.status}`);
    return null;
  }
  const data = (await res.json()) as {
    choices?: Array<{
      message?: { tool_calls?: Array<{ function?: { arguments?: string } }> };
    }>;
  };
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  return args ? (JSON.parse(args) as Record<string, unknown>) : null;
}

/** One prompt → the tool's input object, or null on any failure. */
export async function generateWithTool(opts: {
  prompt: string;
  tool: ToolSpec;
  maxTokens: number;
}): Promise<Record<string, unknown> | null> {
  const config = resolveProvider();
  if (!config) return null;
  try {
    return config.provider === "openai"
      ? await callOpenAI(config, opts.prompt, opts.tool, opts.maxTokens)
      : await callAnthropic(config, opts.prompt, opts.tool, opts.maxTokens);
  } catch (error) {
    console.warn(`[llm] ${config.provider} call failed:`, error);
    return null;
  }
}
