import Anthropic from "@anthropic-ai/sdk";

import { env } from "~/env";

/**
 * DeepSeek speaks the Anthropic Messages API on a separate base URL, so the
 * official SDK works as-is. Both `apiKey` and `baseURL` are passed explicitly:
 * left to its defaults the SDK reads ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL and
 * would silently talk to a different provider.
 */
export const deepseek = new Anthropic({
	apiKey: env.DEEPSEEK_API_KEY,
	baseURL: env.DEEPSEEK_BASE_URL,
});

export const DEEPSEEK_MODEL = env.DEEPSEEK_MODEL;

export const DEFAULT_MAX_TOKENS = 4096;
