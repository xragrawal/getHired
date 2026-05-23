import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { createOllama } from "ollama-ai-provider";
import type { LanguageModel } from "ai";

export type LLMProvider = "anthropic" | "openai" | "ollama";

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  baseURL?: string; // for ollama / custom openai-compatible endpoints
}

export function getLLMConfig(): LLMConfig {
  const provider = (process.env.LLM_PROVIDER as LLMProvider) ?? "ollama";
  const defaultModels: Record<LLMProvider, string> = {
    anthropic: "claude-sonnet-4-6",
    openai: "gpt-4o",
    ollama: "gemma3:4b",
  };
  return {
    provider,
    model: process.env.LLM_MODEL ?? defaultModels[provider],
    baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
  };
}

export function getLanguageModel(config?: LLMConfig): LanguageModel {
  const cfg = config ?? getLLMConfig();

  switch (cfg.provider) {
    case "anthropic":
      return anthropic(cfg.model);

    case "openai":
      return openai(cfg.model);

    case "ollama": {
      const ollamaProvider = createOllama({ baseURL: `${cfg.baseURL}/api` });
      return ollamaProvider(cfg.model);
    }

    default:
      throw new Error(`Unknown LLM provider: ${cfg.provider}`);
  }
}
