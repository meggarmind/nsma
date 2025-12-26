'use client';

import Card from '../ui/Card';
import Select from '../ui/Select';

export default function MappingEditor({ modules = [], phases = [], mapping = {}, onChange }) {
  const updateMapping = (moduleId, phaseId) => {
    const newMapping = { ...mapping };
    if (phaseId) {
      newMapping[moduleId] = phaseId;
    } else {
      delete newMapping[moduleId];
    }
    onChange(newMapping);
  };

  return (
    <Card className="mb-6">
      <h3 className="text-xl font-semibold text-dark-50 mb-4">Module → Phase Mapping</h3>

      {modules.length === 0 || phases.length === 0 ? (
        <p className="text-dark-500 text-center py-4">
          {modules.length === 0 ? 'Add modules first' : 'Add phases first'}
        </p>
      ) : (
        <div className="space-y-3">
          {modules.map((module) => (
            <div key={module.id} className="flex items-center gap-4">
              <div className="flex-1 font-mono text-sm text-dark-300">
                {module.name}
              </div>
              <div className="w-64">
                <Select
                  value={mapping[module.id] || ''}
                  onChange={(e) => updateMapping(module.id, e.target.value)}
                  options={phases.map(p => ({ value: p.id, label: p.name }))}
                  placeholder="Select phase..."
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
