export interface ModelOption {
  value: string;
  label: string;
  provider: "openai" | "anthropic" | "openrouter" | "gemini";
}

export const ALL_MODELS_BY_PROVIDER: Record<"openai" | "anthropic" | "openrouter" | "gemini", ModelOption[]> = {
  anthropic: [
    { value: "claude-3-5-sonnet-latest", label: "Anthropic Sonnet 4.5", provider: "anthropic" },
    { value: "claude-opus-4.5", label: "Anthropic Opus 4.5", provider: "anthropic" },
    { value: "claude-3-5-haiku-latest", label: "Anthropic Haiku 4.5", provider: "anthropic" },
  ],
  openai: [
    { value: "gpt-5.4-nano", label: "OpenAI GPT-5.4 Nano", provider: "openai" },
    { value: "gpt-5.5", label: "OpenAI GPT-5.5", provider: "openai" },
    { value: "gpt-4.1", label: "OpenAI GPT-4.1", provider: "openai" },
  ],
  openrouter: [
    { value: "openai/gpt-5.5", label: "OpenRouter - GPT-5.5", provider: "openrouter" },
    { value: "openai/gpt-5.4-nano", label: "OpenRouter - GPT-5.4 Nano", provider: "openrouter" },
    { value: "openai/gpt-4.1", label: "OpenRouter - GPT-4.1", provider: "openrouter" },
    { value: "anthropic/claude-3-5-sonnet", label: "OpenRouter - Claude Sonnet 4.5", provider: "openrouter" },
    { value: "anthropic/claude-opus-4.5", label: "OpenRouter - Claude Opus 4.5", provider: "openrouter" },
    { value: "anthropic/claude-haiku-4.5", label: "OpenRouter - Claude Haiku 4.5", provider: "openrouter" },
    { value: "deepseek/deepseek-v4-flash", label: "OpenRouter - DeepSeek V4 Flash", provider: "openrouter" },
    { value: "moonshotai/kimi-k2.6", label: "OpenRouter - Kimi K2.6", provider: "openrouter" },
    { value: "meta-llama/llama-3.1-8b-instruct", label: "OpenRouter - Llama 3.1", provider: "openrouter" },
    { value: "minimax/minimax-2.7", label: "OpenRouter - MiniMax 2.7", provider: "openrouter" },
  ],
  gemini: [
    { value: "gemini-3.1-flash-lite", label: "Google Gemini 3.1 Flash Lite", provider: "gemini" },
    { value: "gemini-2.5-flash", label: "Google Gemini 2.5 Flash", provider: "gemini" },
    { value: "gemini-1.5-pro", label: "Google Gemini 1.5 Pro", provider: "gemini" },
  ]
};
