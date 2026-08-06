import { describe, it, expect } from 'vitest';
import { formatIdeationListing } from '@/plugin/lib/format-listing';

describe('formatIdeationListing', () => {
  it('lists each item with its Notion page ID, type, module, priority, and description', () => {
    const items = [
      {
        pageId: 'page-123',
        title: 'Add CSV export',
        type: 'Feature',
        affectedModule: 'Analytics',
        priority: 'Medium',
        description: 'Export analytics data as CSV'
      }
    ];

    const text = formatIdeationListing(items as any);

    expect(text).toContain('Add CSV export');
    expect(text).toContain('page-123');
    expect(text).toContain('Feature');
    expect(text).toContain('Analytics');
    expect(text).toContain('Medium');
    expect(text).toContain('Export analytics data as CSV');
  });

  it('ends with a directive to run ideation then call record_triage_decision', () => {
    const text = formatIdeationListing([{ pageId: 'p', title: 't', type: 'Feature', affectedModule: '', priority: 'Low', description: '' }] as any);

    expect(text).toContain('superpowers:brainstorming');
    expect(text).toContain('record_triage_decision');
  });

  it('returns an empty-queue message when there are no items', () => {
    expect(formatIdeationListing([])).toContain('No items need triage');
  });

  it('names superpowers:brainstorming specifically when ideationMethod is "brainstorming"', () => {
    const text = formatIdeationListing(
      [{ pageId: 'p', title: 't', type: 'Feature', affectedModule: '', priority: 'Low', description: '' }] as any,
      'brainstorming'
    );

    expect(text).toContain('run superpowers:brainstorming');
    expect(text).not.toContain('plan mode');
  });

  it("names Claude Code's plan mode specifically when ideationMethod is \"plan-mode\"", () => {
    const text = formatIdeationListing(
      [{ pageId: 'p', title: 't', type: 'Feature', affectedModule: '', priority: 'Low', description: '' }] as any,
      'plan-mode'
    );

    expect(text).toContain('plan mode');
    expect(text).not.toContain('superpowers:brainstorming');
  });
});
