'use client';

import { Plus, Trash2 } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';

export default function PhaseList({ phases = [], onChange }) {
  const addPhase = () => {
    onChange([
      ...phases,
      { id: Date.now().toString(), name: '', description: '', keywords: [] }
    ]);
  };

  const updatePhase = (id, updates) => {
    onChange(phases.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const removePhase = (id) => {
    onChange(phases.filter(p => p.id !== id));
  };

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-dark-50">Phases</h3>
        <Button size="sm" onClick={addPhase} className="flex items-center gap-2">
          <Plus size={16} />
          Add Phase
        </Button>
      </div>

      {phases.length === 0 ? (
        <p className="text-dark-500 text-center py-4">No phases configured</p>
      ) : (
        <div className="space-y-4">
          {phases.map((phase) => (
            <div key={phase.id} className="p-4 bg-dark-900/50 rounded-lg">
              <div className="flex gap-4">
                <div className="flex-1 space-y-3">
                  <Input
                    label="Name"
                    value={phase.name}
                    onChange={(e) => updatePhase(phase.id, { name: e.target.value })}
                    placeholder="e.g., Phase 1: Billing Core"
                  />
                  <Input
                    label="Description"
                    value={phase.description}
                    onChange={(e) => updatePhase(phase.id, { description: e.target.value })}
                    placeholder="Brief description"
                  />
                  <Input
                    label="Keywords (comma-separated)"
                    value={phase.keywords?.join(', ') || ''}
                    onChange={(e) => updatePhase(phase.id, {
                      keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean)
                    })}
                    placeholder="billing, payment, invoice"
                  />
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => removePhase(phase.id)}
                  className="self-start"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
