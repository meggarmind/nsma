'use client';

import { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Check, AlertCircle, Folder, FileText, Settings, Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

const STEPS = [
  { id: 1, title: 'Project Root', icon: Folder },
  { id: 2, title: 'Details', icon: FileText },
  { id: 3, title: 'Validation', icon: Check },
  { id: 4, title: 'Options', icon: Settings },
  { id: 5, title: 'Creating', icon: Loader2 }
];

export default function AddProjectWizard({ isOpen, onClose, onSuccess }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form data
  const [projectRoot, setProjectRoot] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [promptsPath, setPromptsPath] = useState('');

  // Validation state
  const [validation, setValidation] = useState(null);

  // Config detection
  const [configDetection, setConfigDetection] = useState(null);
  const [importConfig, setImportConfig] = useState(true);
  const [createConfigTemplate, setCreateConfigTemplate] = useState(false);
  const [hookStyle, setHookStyle] = useState('full');

  // Result state
  const [result, setResult] = useState(null);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setProjectRoot('');
      setName('');
      setSlug('');
      setPromptsPath('');
      setValidation(null);
      setConfigDetection(null);
      setImportConfig(true);
      setCreateConfigTemplate(false);
      setHookStyle('full');
      setResult(null);
      setError(null);
    }
  }, [isOpen]);

  // Generate defaults when projectRoot changes
  const handleProjectRootBlur = async () => {
    if (!projectRoot.trim()) return;

    try {
      const res = await fetch('/api/projects/wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-defaults', projectRoot })
      });
      const data = await res.json();

      if (data.success) {
        setName(data.defaults.name);
        setSlug(data.defaults.slug);
        setPromptsPath(data.defaults.promptsPath);
        setError(null);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to generate defaults');
    }
  };

  // Validate paths when moving to step 3
  const handleValidatePaths = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/projects/wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'validate-paths',
          projectRoot,
          promptsPath
        })
      });
      const data = await res.json();

      setValidation(data.validation);
      if (data.correctedPath) {
        setPromptsPath(data.correctedPath);
      }

      if (!data.success) {
        setError(data.validation?.errors?.[0] || 'Validation failed');
        setLoading(false);
        return false;
      }

      // Also detect config files
      const configRes = await fetch('/api/projects/wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'detect-config', projectRoot })
      });
      const configData = await configRes.json();
      setConfigDetection(configData.detection);

      // Pre-set options based on detection
      if (configData.detection?.found) {
        setImportConfig(true);
        setCreateConfigTemplate(false);
      } else {
        setImportConfig(false);
        setCreateConfigTemplate(true);
      }

      setLoading(false);
      return true;
    } catch (err) {
      setError('Failed to validate paths');
      setLoading(false);
      return false;
    }
  };

  // Create project
  const handleCreateProject = async () => {
    setStep(5);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/projects/wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-project',
          projectRoot,
          name,
          slug,
          promptsPath,
          importConfig,
          hookStyle,
          createConfigTemplate
        })
      });
      const data = await res.json();

      if (data.success) {
        setResult(data);
      } else {
        setError(data.errors?.join(', ') || 'Failed to create project');
        setStep(4); // Go back to options
      }
    } catch (err) {
      setError('Failed to create project');
      setStep(4);
    } finally {
      setLoading(false);
    }
  };

  // Navigation
  const handleNext = async () => {
    if (step === 1 && !projectRoot.trim()) {
      setError('Project root path is required');
      return;
    }

    if (step === 2) {
      const valid = await handleValidatePaths();
      if (!valid) return;
    }

    if (step === 4) {
      await handleCreateProject();
      return;
    }

    setStep(s => Math.min(s + 1, 5));
    setError(null);
  };

  const handleBack = () => {
    setStep(s => Math.max(s - 1, 1));
    setError(null);
  };

  const handleFinish = () => {
    onSuccess?.();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden glass rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-dark-700">
          <div>
            <h2 className="text-2xl font-semibold text-dark-50">Add New Project</h2>
            <p className="text-sm text-dark-400 mt-1">
              Step {step} of {STEPS.length}: {STEPS[step - 1].title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-dark-400 hover:text-dark-200 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 py-3 border-b border-dark-700">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors
                    ${step > s.id ? 'bg-green-500 border-green-500 text-white' :
                      step === s.id ? 'border-accent text-accent' :
                      'border-dark-600 text-dark-500'}`}
                >
                  {step > s.id ? (
                    <Check size={16} />
                  ) : (
                    <s.icon size={16} className={step === s.id && s.icon === Loader2 ? 'animate-spin' : ''} />
                  )}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`w-12 h-0.5 mx-2 transition-colors
                      ${step > s.id ? 'bg-green-500' : 'bg-dark-600'}`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Step 1: Project Root */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-dark-300 mb-4">
                Enter the root path of your project. This is the directory that contains your source code.
              </p>
              <Input
                label="Project Root Path"
                value={projectRoot}
                onChange={(e) => setProjectRoot(e.target.value)}
                onBlur={handleProjectRootBlur}
                placeholder="/home/user/projects/MyProject"
                helpText="Absolute path to your project directory"
                required
              />
            </div>
          )}

          {/* Step 2: Project Details */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-dark-300 mb-4">
                Review and edit the auto-generated project details. The slug must match the project option in your Notion database.
              </p>
              <Input
                label="Project Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Project"
                helpText="Display name for the project"
                required
              />
              <Input
                label="Slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="my-project"
                helpText="Lowercase identifier (must match Notion 'Project' dropdown)"
                required
              />
              <Input
                label="Prompts Directory"
                value={promptsPath}
                onChange={(e) => setPromptsPath(e.target.value)}
                placeholder="/home/user/projects/MyProject/prompts"
                helpText="Directory where prompt files will be stored"
                required
              />
            </div>
          )}

          {/* Step 3: Validation */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-dark-300 mb-4">
                Review the validation results and confirm to proceed.
              </p>

              {/* Summary */}
              <div className="bg-dark-800 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-dark-400">Project Root:</span>
                  <span className="text-dark-200 font-mono text-xs">{projectRoot}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-dark-400">Project Name:</span>
                  <span className="text-dark-200">{name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-dark-400">Slug:</span>
                  <span className="text-dark-200 font-mono">{slug}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-dark-400">Prompts Path:</span>
                  <span className="text-dark-200 font-mono text-xs">{promptsPath}</span>
                </div>
              </div>

              {/* Validation Status */}
              {validation && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-green-400">
                    <Check size={18} />
                    <span>Paths validated successfully</span>
                  </div>

                  {validation.warnings?.length > 0 && (
                    <div className="space-y-1">
                      {validation.warnings.map((w, i) => (
                        <div key={i} className="flex items-center gap-2 text-yellow-400 text-sm">
                          <AlertCircle size={14} />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Config Detection */}
              {configDetection && (
                <div className="mt-4 pt-4 border-t border-dark-700">
                  <h4 className="text-sm font-medium text-dark-200 mb-2">Configuration Files</h4>
                  {configDetection.found ? (
                    <div className="flex items-center gap-2 text-green-400 text-sm">
                      <Check size={14} />
                      <span>Found: {configDetection.files.join(', ')}</span>
                    </div>
                  ) : (
                    <div className="text-dark-400 text-sm">
                      No configuration files found (.nsma-config.md, PERSPECTIVE.md, etc.)
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Options */}
          {step === 4 && (
            <div className="space-y-6">
              <p className="text-dark-300 mb-4">
                Configure import and hook options for your project.
              </p>

              {/* Config Import */}
              <div>
                <h4 className="text-sm font-medium text-dark-200 mb-3">Configuration</h4>
                {configDetection?.found ? (
                  <label className="flex items-center gap-3 p-3 bg-dark-800 rounded-lg cursor-pointer hover:bg-dark-700 transition-colors">
                    <input
                      type="checkbox"
                      checked={importConfig}
                      onChange={(e) => setImportConfig(e.target.checked)}
                      className="w-4 h-4 rounded border-dark-600 text-accent focus:ring-accent"
                    />
                    <div>
                      <span className="text-dark-200">Import phases and modules from config files</span>
                      <p className="text-xs text-dark-500">Found: {configDetection.files.join(', ')}</p>
                    </div>
                  </label>
                ) : (
                  <label className="flex items-center gap-3 p-3 bg-dark-800 rounded-lg cursor-pointer hover:bg-dark-700 transition-colors">
                    <input
                      type="checkbox"
                      checked={createConfigTemplate}
                      onChange={(e) => setCreateConfigTemplate(e.target.checked)}
                      className="w-4 h-4 rounded border-dark-600 text-accent focus:ring-accent"
                    />
                    <div>
                      <span className="text-dark-200">Create starter .nsma-config.md template</span>
                      <p className="text-xs text-dark-500">Includes example phases and modules</p>
                    </div>
                  </label>
                )}
              </div>

              {/* Hook Style */}
              <div>
                <h4 className="text-sm font-medium text-dark-200 mb-3">Session Start Hook</h4>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 bg-dark-800 rounded-lg cursor-pointer hover:bg-dark-700 transition-colors">
                    <input
                      type="radio"
                      name="hookStyle"
                      value="full"
                      checked={hookStyle === 'full'}
                      onChange={() => setHookStyle('full')}
                      className="w-4 h-4 border-dark-600 text-accent focus:ring-accent"
                    />
                    <div>
                      <span className="text-dark-200">Full (Recommended)</span>
                      <p className="text-xs text-dark-500">Sync + pending prompt analysis + deferred check</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 bg-dark-800 rounded-lg cursor-pointer hover:bg-dark-700 transition-colors">
                    <input
                      type="radio"
                      name="hookStyle"
                      value="minimal"
                      checked={hookStyle === 'minimal'}
                      onChange={() => setHookStyle('minimal')}
                      className="w-4 h-4 border-dark-600 text-accent focus:ring-accent"
                    />
                    <div>
                      <span className="text-dark-200">Minimal</span>
                      <p className="text-xs text-dark-500">Just sync, no prompt analysis</p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Creating / Result */}
          {step === 5 && (
            <div className="space-y-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 size={48} className="text-accent animate-spin mb-4" />
                  <p className="text-dark-300">Creating project...</p>
                </div>
              ) : result ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-green-400 text-lg">
                    <Check size={24} />
                    <span>Project created successfully!</span>
                  </div>

                  <div className="bg-dark-800 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-dark-400">Project:</span>
                      <span className="text-dark-200">{result.project?.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-dark-400">ID:</span>
                      <span className="text-dark-200 font-mono text-xs">{result.project?.id}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-dark-400">Slug:</span>
                      <span className="text-dark-200 font-mono">{result.project?.slug}</span>
                    </div>
                  </div>

                  {result.imported && (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                      <p className="text-green-400 text-sm">
                        Imported from {result.imported.source}: {result.imported.phases} phases, {result.imported.modules} modules
                      </p>
                    </div>
                  )}

                  {result.created?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-dark-200 mb-2">Created:</h4>
                      <ul className="space-y-1 text-sm">
                        {result.created.map((item, i) => (
                          <li key={i} className="flex items-center gap-2 text-dark-300">
                            <Check size={14} className="text-green-400" />
                            <span className="font-mono text-xs break-all">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {result.warnings?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-yellow-400 mb-2">Warnings:</h4>
                      <ul className="space-y-1 text-sm">
                        {result.warnings.map((w, i) => (
                          <li key={i} className="flex items-center gap-2 text-yellow-400">
                            <AlertCircle size={14} />
                            <span>{w}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-dark-700">
          <div>
            {step > 1 && step < 5 && (
              <Button variant="secondary" onClick={handleBack}>
                <ChevronLeft size={18} className="mr-1" />
                Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={onClose}>
              {step === 5 && result ? 'Close' : 'Cancel'}
            </Button>
            {step < 5 && (
              <Button onClick={handleNext} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 size={18} className="mr-2 animate-spin" />
                    Validating...
                  </>
                ) : step === 4 ? (
                  <>
                    Create Project
                    <ChevronRight size={18} className="ml-1" />
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight size={18} className="ml-1" />
                  </>
                )}
              </Button>
            )}
            {step === 5 && result && (
              <Button onClick={handleFinish}>
                Done
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
