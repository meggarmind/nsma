'use client';

import { ChevronUp, ChevronDown, Check, AlertCircle } from 'lucide-react';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { ITEM_TYPES } from '@/lib/constants';

const PROVIDERS = {
  anthropic: {
    name: 'Anthropic Claude',
    keyField: 'anthropicApiKey',
    placeholder: 'sk-ant-...',
    helpUrl: 'https://console.anthropic.com/settings/keys',
    helpText: 'Anthropic Console'
  },
  gemini: {
    name: 'Google Gemini',
    keyField: 'geminiApiKey',
    placeholder: 'AIza...',
    helpUrl: 'https://aistudio.google.com/app/apikey',
    helpText: 'Google AI Studio'
  }
};

export default function AIConfig({ settings, onChange }) {
  const priorityOrder = settings.aiProviderPriority || ['anthropic', 'gemini'];

  const moveProvider = (providerId, direction) => {
    const currentIndex = priorityOrder.indexOf(providerId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= priorityOrder.length) return;

    const newOrder = [...priorityOrder];
    [newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]];
    onChange({ aiProviderPriority: newOrder });
  };

  const isConfigured = (providerId) => {
    const keyField = PROVIDERS[providerId]?.keyField;
    return Boolean(settings[keyField]?.trim());
  };

  return (
    <Card className="mb-6">
      <h3 className="text-xl font-semibold text-dark-50 mb-4">AI Prompt Expansion</h3>
      <p className="text-sm text-dark-400 mb-6">
        When a Notion item has <code className="bg-dark-800 px-1 rounded">hydrated=false</code>,
        the system uses AI to automatically expand brief ideas into detailed development prompts.
        Configure multiple providers for automatic fallback if one fails.
      </p>

      {/* Provider Priority Section */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-dark-200 mb-2">
          Provider Priority
        </label>
        <p className="text-xs text-dark-500 mb-3">
          Drag or use arrows to reorder. The first configured provider will be tried first.
        </p>
        <div className="space-y-2">
          {priorityOrder.map((providerId, index) => {
            const provider = PROVIDERS[providerId];
            if (!provider) return null;

            const configured = isConfigured(providerId);

            return (
              <div
                key={providerId}
                className="flex items-center gap-3 p-3 bg-dark-800 rounded-lg border border-dark-700"
              >
                <span className="text-dark-400 font-mono text-sm w-6">{index + 1}.</span>

                {configured ? (
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-500/20">
                    <Check className="w-3 h-3 text-green-400" />
                  </span>
                ) : (
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-dark-600">
                    <AlertCircle className="w-3 h-3 text-dark-400" />
                  </span>
                )}

                <span className={`flex-1 ${configured ? 'text-dark-100' : 'text-dark-400'}`}>
                  {provider.name}
                </span>

                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => moveProvider(providerId, 'up')}
                    disabled={index === 0}
                    className="p-1"
                    aria-label={`Move ${provider.name} up`}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => moveProvider(providerId, 'down')}
                    disabled={index === priorityOrder.length - 1}
                    className="p-1"
                    aria-label={`Move ${provider.name} down`}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* API Key Inputs */}
      <div className="space-y-6">
        {priorityOrder.map((providerId) => {
          const provider = PROVIDERS[providerId];
          if (!provider) return null;

          return (
            <div key={providerId}>
              <Input
                type="password"
                label={`${provider.name} API Key`}
                value={settings[provider.keyField] || ''}
                onChange={(e) => onChange({ [provider.keyField]: e.target.value })}
                placeholder={provider.placeholder}
              />
              <p className="text-sm text-dark-500 mt-1">
                Get your API key from{' '}
                <a
                  href={provider.helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  {provider.helpText}
                </a>
              </p>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-dark-500 mt-6">
        Leave all API keys empty to skip AI expansion (brief descriptions will be used as-is).
        If a provider fails after retries, the system automatically tries the next configured provider.
      </p>

      {/* Feature-Dev Enhancement Section */}
      <div className="mt-6 pt-6 border-t border-dark-700">
        <h4 className="text-lg font-medium text-dark-100 mb-3">
          Feature-Dev Enhancement
        </h4>
        <p className="text-sm text-dark-400 mb-4">
          Adds architecture analysis, code exploration results, and implementation
          blueprints to generated prompts for selected item types.
        </p>

        {/* Master toggle */}
        <label className="flex items-center gap-3 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={settings.featureDevEnabled ?? true}
            onChange={(e) => onChange({ featureDevEnabled: e.target.checked })}
            className="w-5 h-5 rounded border-dark-600 bg-dark-800 text-accent focus:ring-accent"
          />
          <span className="text-dark-200">Enable feature-dev analysis</span>
        </label>

        {/* Type selection - only shown when enabled */}
        {settings.featureDevEnabled !== false && (
          <div className="ml-8">
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Apply to item types:
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ITEM_TYPES.map((type) => {
                const selectedTypes = settings.featureDevTypes || ['Feature', 'Improvement'];
                const isSelected = selectedTypes.includes(type);

                const toggleType = () => {
                  const newTypes = isSelected
                    ? selectedTypes.filter(t => t !== type)
                    : [...selectedTypes, type];
                  onChange({ featureDevTypes: newTypes });
                };

                return (
                  <label key={type} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={toggleType}
                      className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-accent focus:ring-accent"
                    />
                    <span className={`text-sm ${isSelected ? 'text-dark-200' : 'text-dark-500'}`}>
                      {type}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
