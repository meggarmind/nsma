import { describe, it, expect } from 'vitest';
import { PromptGenerator } from '@/plugin/lib/prompt-generator';

const project = {
  slug: 'nsma',
  name: 'Nsma',
  phases: [
    { id: 'foundation', name: 'Phase 1: Foundation', keywords: ['database', 'auth', 'setup'] },
    { id: 'ui-ux', name: 'Phase 3: UI/UX', keywords: ['ui', 'component', 'css'] },
    { id: 'backlog', name: 'Backlog', keywords: ['idea', 'future'] }
  ],
  modules: [
    { id: 'core', name: 'Core Platform', filePaths: ['lib/'] }
  ],
  modulePhaseMapping: { core: 'foundation' }
};

describe('PromptGenerator.determinePhase', () => {
  const generator = new PromptGenerator(project, {});

  it('uses module-phase mapping when the item has a mapped module', () => {
    const item = { title: 'Add CSV export', description: 'export button', affectedModule: 'Core Platform' };
    expect(generator.determinePhase(item)).toBe('Phase 1: Foundation');
  });

  it('falls back to keyword matching when the module is unmapped', () => {
    const item = { title: 'Redesign the settings page css', description: 'polish the ui', affectedModule: 'Unknown Module' };
    expect(generator.determinePhase(item)).toBe('Phase 3: UI/UX');
  });

  it('defaults to the first phase when nothing matches', () => {
    const item = { title: 'Totally unrelated item', description: 'no keywords here', affectedModule: 'Unknown Module' };
    expect(generator.determinePhase(item)).toBe('Phase 1: Foundation');
  });

  it('defaults to Backlog when the project has no phases', () => {
    const emptyGenerator = new PromptGenerator({ ...project, phases: [] }, {});
    const item = { title: 'Anything', description: 'anything', affectedModule: '' };
    expect(emptyGenerator.determinePhase(item)).toBe('Backlog');
  });
});

describe('PromptGenerator.generate', () => {
  const generator = new PromptGenerator(project, {});
  const item = {
    pageId: 'page-123',
    url: 'https://notion.so/page-123',
    title: 'Add CSV export',
    type: 'Feature',
    affectedModule: 'Core Platform',
    priority: 'Medium',
    description: 'Export analytics data as CSV',
    capturedDate: '2026-01-01T00:00:00.000Z',
    isHydrated: false
  };

  it('includes correct frontmatter fields', () => {
    const { content } = generator.generate(item);
    expect(content).toContain('notion_page_id: page-123');
    expect(content).toContain('project: nsma');
    expect(content).toContain('phase: Phase 1: Foundation');
    expect(content).toContain('type: Feature');
  });

  it('directs completion to /nsma-complete instead of a manual Notion update', () => {
    const { content, filename } = generator.generate(item);
    expect(content).toContain(`/nsma-complete ${filename}`);
    expect(content).not.toContain('mcp__notion__notion-update-page');
  });

  it('uses the item description as the objective when not hydrated', () => {
    const { content } = generator.generate(item);
    expect(content).toContain('## Objective');
    expect(content).toContain('Export analytics data as CSV');
  });

  it('uses provided page content as the body when hydrated', () => {
    const hydratedItem = { ...item, isHydrated: true };
    const { content } = generator.generate(hydratedItem, '## Custom Body\nFull page content here.');
    expect(content).toContain('## Custom Body');
    expect(content).toContain('Full page content here.');
  });
});
