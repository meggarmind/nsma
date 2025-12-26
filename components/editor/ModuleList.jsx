'use client';

import { Plus, Trash2 } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';

export default function ModuleList({ modules = [], onChange }) {
  const addModule = () => {
    onChange([
      ...modules,
      { id: Date.now().toString(), name: '', filePaths: [] }
    ]);
  };

  const updateModule = (id, updates) => {
    onChange(modules.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const removeModule = (id) => {
    onChange(modules.filter(m => m.id !== id));
  };

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-dark-50">Modules</h3>
        <Button size="sm" onClick={addModule} className="flex items-center gap-2">
          <Plus size={16} />
          Add Module
        </Button>
      </div>

      {modules.length === 0 ? (
        <p className="text-dark-500 text-center py-4">No modules configured</p>
      ) : (
        <div className="space-y-4">
          {modules.map((module) => (
            <div key={module.id} className="p-4 bg-dark-900/50 rounded-lg">
              <div className="flex gap-4">
                <div className="flex-1 space-y-3">
                  <Input
                    label="Module Name"
                    value={module.name}
                    onChange={(e) => updateModule(module.id, { name: e.target.value })}
                    placeholder="e.g., Billing System"
                  />
                  <Input
                    label="File Paths (comma-separated)"
                    value={module.filePaths?.join(', ') || ''}
                    onChange={(e) => updateModule(module.id, {
                      filePaths: e.target.value.split(',').map(p => p.trim()).filter(Boolean)
                    })}
                    placeholder="src/actions/billing/, src/components/billing/"
                  />
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => removeModule(module.id)}
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
