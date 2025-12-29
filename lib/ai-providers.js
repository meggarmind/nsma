/**
 * AI Provider Abstraction Layer
 *
 * Provides a unified interface for multiple AI providers (Anthropic Claude, Google Gemini)
 * with consistent error handling and retry logic.
 */

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Base class defining the AI provider interface
 */
class AIProvider {
  constructor(name) {
    this.name = name;
  }

  /**
   * Check if this provider is configured with valid credentials
   * @param {Object} settings - Application settings
   * @returns {boolean}
   */
  isConfigured(settings) {
    throw new Error('isConfigured must be implemented');
  }

  /**
   * Expand a prompt using this AI provider
   * @param {string} systemPrompt - System/instruction prompt
   * @param {string} userPrompt - User prompt to expand
   * @returns {Promise<string>} - Expanded content
   */
  async expand(systemPrompt, userPrompt) {
    throw new Error('expand must be implemented');
  }

  /**
   * Check if an error from this provider is retryable
   * @param {Error} error - The error to check
   * @returns {boolean}
   */
  isRetryable(error) {
    // Common network errors are always retryable
    const code = error.code;
    if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' ||
        code === 'ENOTFOUND' || code === 'ECONNRESET') {
      return true;
    }
    return false;
  }
}

/**
 * Anthropic Claude Provider
 */
export class AnthropicProvider extends AIProvider {
  constructor(apiKey) {
    super('Anthropic Claude');
    this.client = new Anthropic({ apiKey });
  }

  isConfigured(settings) {
    return Boolean(settings.anthropicApiKey?.trim());
  }

  async expand(systemPrompt, userPrompt) {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    return response.content[0].text;
  }

  isRetryable(error) {
    // Check base network errors first
    if (super.isRetryable(error)) return true;

    const status = error.status || error.statusCode;
    // 529 = overloaded, 5xx = server errors
    if (status === 529 || status >= 500) return true;

    // Check message for retryable patterns
    const message = (error.message || '').toLowerCase();
    if (message.includes('overloaded') || message.includes('529')) return true;
    if (message.includes('rate limit')) return true;

    return false;
  }
}

/**
 * Google Gemini Provider
 */
export class GeminiProvider extends AIProvider {
  constructor(apiKey) {
    super('Google Gemini');
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-1.5-pro',
      generationConfig: {
        maxOutputTokens: 2000,
        temperature: 0.7
      }
    });
  }

  isConfigured(settings) {
    return Boolean(settings.geminiApiKey?.trim());
  }

  async expand(systemPrompt, userPrompt) {
    // Gemini uses systemInstruction for system prompts
    const modelWithSystem = this.genAI.getGenerativeModel({
      model: 'gemini-1.5-pro',
      systemInstruction: systemPrompt,
      generationConfig: {
        maxOutputTokens: 2000,
        temperature: 0.7
      }
    });

    const result = await modelWithSystem.generateContent(userPrompt);
    const response = await result.response;
    return response.text();
  }

  isRetryable(error) {
    // Check base network errors first
    if (super.isRetryable(error)) return true;

    const status = error.status || error.statusCode;
    // 5xx = server errors, 429 = rate limit
    if (status === 429 || status >= 500) return true;

    // Check Gemini-specific error patterns
    const message = (error.message || '').toLowerCase();
    if (message.includes('rate limit') || message.includes('quota exceeded')) return true;
    if (message.includes('overloaded') || message.includes('unavailable')) return true;
    if (message.includes('internal error') || message.includes('server error')) return true;

    return false;
  }
}

/**
 * Provider registry - maps provider names to their classes
 */
const PROVIDER_REGISTRY = {
  anthropic: {
    class: AnthropicProvider,
    keyField: 'anthropicApiKey',
    displayName: 'Anthropic Claude'
  },
  gemini: {
    class: GeminiProvider,
    keyField: 'geminiApiKey',
    displayName: 'Google Gemini'
  }
};

/**
 * Get configured providers in priority order
 *
 * @param {Object} settings - Application settings containing API keys and priority
 * @returns {AIProvider[]} - Array of configured provider instances in priority order
 */
export function getConfiguredProviders(settings) {
  const priorityOrder = settings.aiProviderPriority || ['anthropic', 'gemini'];
  const providers = [];

  for (const providerName of priorityOrder) {
    const registry = PROVIDER_REGISTRY[providerName];
    if (!registry) continue;

    const apiKey = settings[registry.keyField];
    if (apiKey?.trim()) {
      const ProviderClass = registry.class;
      providers.push(new ProviderClass(apiKey));
    }
  }

  return providers;
}

/**
 * Get all available provider metadata (for UI display)
 *
 * @param {Object} settings - Application settings
 * @returns {Array<{id: string, name: string, configured: boolean}>}
 */
export function getProviderMetadata(settings) {
  const priorityOrder = settings.aiProviderPriority || ['anthropic', 'gemini'];

  return priorityOrder.map(id => {
    const registry = PROVIDER_REGISTRY[id];
    if (!registry) return null;

    return {
      id,
      name: registry.displayName,
      configured: Boolean(settings[registry.keyField]?.trim())
    };
  }).filter(Boolean);
}

/**
 * Get all provider IDs (for settings initialization)
 * @returns {string[]}
 */
export function getAllProviderIds() {
  return Object.keys(PROVIDER_REGISTRY);
}
