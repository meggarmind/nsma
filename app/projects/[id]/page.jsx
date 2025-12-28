'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import Header from '@/components/layout/Header';
import Button from '@/components/ui/Button';
import BasicSettings from '@/components/editor/BasicSettings';
import PhaseList from '@/components/editor/PhaseList';
import ModuleList from '@/components/editor/ModuleList';
import MappingEditor from '@/components/editor/MappingEditor';
import ConfigImporter from '@/components/editor/ConfigImporter';

export default function ProjectEditor() {
  const router = useRouter();
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProject();
  }, [id]);

  const loadProject = async () => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      const data = await res.json();
      setProject(data);
    } catch (error) {
      console.error('Failed to load project:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project)
      });
      router.push('/');
    } catch (error) {
      console.error('Failed to save project:', error);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this project?')) return;

    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      router.push('/');
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  const updateProject = (updates) => {
    setProject({ ...project, ...updates });
  };

  const handleConfigImport = (updatedProject) => {
    setProject(updatedProject);
  };

  if (loading) {
    return <div className="text-dark-500">Loading...</div>;
  }

  if (!project) {
    return <div className="text-dark-500">Project not found</div>;
  }

  return (
    <>
      <Header
        title={project.name}
        description="Configure phases, modules, and sync settings"
        actions={
          <>
            <Button variant="secondary" onClick={() => router.push('/')}>
              <ArrowLeft size={18} />
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              <Trash2 size={18} />
            </Button>
            <Button onClick={handleSave} className="flex items-center gap-2">
              <Save size={18} />
              Save Changes
            </Button>
          </>
        }
      />

      <ConfigImporter
        projectId={id}
        onImportSuccess={handleConfigImport}
      />

      <BasicSettings
        project={project}
        onChange={updateProject}
      />

      <PhaseList
        phases={project.phases}
        onChange={(phases) => updateProject({ phases })}
      />

      <ModuleList
        modules={project.modules}
        onChange={(modules) => updateProject({ modules })}
      />

      <MappingEditor
        modules={project.modules}
        phases={project.phases}
        mapping={project.modulePhaseMapping}
        onChange={(modulePhaseMapping) => updateProject({ modulePhaseMapping })}
      />
    </>
  );
}
