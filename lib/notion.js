import { withRetry, fetchWithRetryInfo } from './retry.js';

export class NotionClient {
  constructor(token) {
    this.token = token;
    this.baseUrl = 'https://api.notion.com/v1';
    this.headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    };
  }

  /**
   * Make a request to the Notion API with automatic retry on transient failures
   * Retries on: 429 (rate limit), 5xx (server errors), network errors
   * Does NOT retry: 4xx client errors (except 429)
   */
  async request(method, endpoint, body = null) {
    const options = {
      method,
      headers: this.headers
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const url = `${this.baseUrl}${endpoint}`;

    return withRetry(
      async () => {
        const response = await fetchWithRetryInfo(url, options);
        return response.json();
      },
      {
        maxRetries: 3,
        baseDelay: 1000,  // 1s, 2s, 4s backoff
        onRetry: (error, attempt, delay) => {
          console.warn(
            `Notion API retry ${attempt}/3 for ${method} ${endpoint}: ` +
            `${error.message} (waiting ${Math.round(delay / 1000)}s)`
          );
        }
      }
    );
  }

  async queryDatabase(databaseId, projectSlug = null, status = 'Not started') {
    const filter = {
      and: [
        {
          or: [
            { property: 'Status', select: { equals: status } },
            { property: 'Status', select: { is_empty: true } }
          ]
        }
      ]
    };

    if (projectSlug) {
      filter.and.push({
        property: 'Project',
        select: { equals: projectSlug }
      });
    }

    const result = await this.request('POST', `/databases/${databaseId}/query`, { filter });
    return result.results || [];
  }

  async getPageBlocks(pageId) {
    const allBlocks = [];
    let cursor = null;
    let hasMore = true;

    // Paginate through all blocks (Notion returns max 100 per request)
    while (hasMore) {
      const endpoint = cursor
        ? `/blocks/${pageId}/children?page_size=100&start_cursor=${cursor}`
        : `/blocks/${pageId}/children?page_size=100`;

      const result = await this.request('GET', endpoint);
      allBlocks.push(...(result.results || []));

      hasMore = result.has_more || false;
      cursor = result.next_cursor;
    }

    return allBlocks;
  }

  async updatePage(pageId, properties) {
    return this.request('PATCH', `/pages/${pageId}`, { properties });
  }

  blocksToMarkdown(blocks) {
    return blocks.map(block => {
      const type = block.type;
      const data = block[type] || {};
      const text = this.extractRichText(data.rich_text || []);

      switch (type) {
        case 'paragraph': return text;
        case 'heading_1': return `# ${text}`;
        case 'heading_2': return `## ${text}`;
        case 'heading_3': return `### ${text}`;
        case 'bulleted_list_item': return `- ${text}`;
        case 'numbered_list_item': return `1. ${text}`;
        case 'to_do':
          const checked = data.checked ? 'x' : ' ';
          return `- [${checked}] ${text}`;
        case 'code':
          const lang = data.language || '';
          return `\`\`\`${lang}\n${text}\n\`\`\``;
        case 'quote': return `> ${text}`;
        case 'divider': return '---';
        case 'callout':
          const emoji = data.icon?.emoji || '';
          return `> ${emoji} ${text}`;
        default: return text;
      }
    }).filter(Boolean).join('\n\n');
  }

  extractRichText(richTextArray) {
    return richTextArray.map(item => {
      let text = item.plain_text || '';
      const ann = item.annotations || {};

      if (ann.bold) text = `**${text}**`;
      if (ann.italic) text = `*${text}*`;
      if (ann.code) text = `\`${text}\``;
      if (ann.strikethrough) text = `~~${text}~~`;

      return text;
    }).join('');
  }

  /**
   * Sync project slugs to Notion database's Project select options
   * Adds any missing project slugs to the dropdown
   */
  async syncProjectOptionsToDatabase(databaseId, projectSlugs) {
    try {
      // Fetch current database schema
      const database = await this.request('GET', `/databases/${databaseId}`);

      // Get existing Project property options
      const projectProp = database.properties?.Project;
      if (!projectProp || projectProp.type !== 'select') {
        throw new Error('Project property not found or not a select type');
      }

      const existingOptions = projectProp.select?.options || [];
      const existingNames = new Set(existingOptions.map(o => o.name));

      // Filter out system slugs and find new ones to add
      const newSlugs = projectSlugs.filter(slug =>
        !slug.startsWith('__') && !existingNames.has(slug)
      );

      if (newSlugs.length === 0) {
        return { added: [], existing: [...existingNames] };
      }

      // Create new options (Notion will auto-assign colors)
      const newOptions = newSlugs.map(slug => ({ name: slug }));

      // Update database with merged options
      await this.request('PATCH', `/databases/${databaseId}`, {
        properties: {
          Project: {
            select: {
              options: [...existingOptions, ...newOptions]
            }
          }
        }
      });

      return {
        added: newSlugs,
        existing: [...existingNames]
      };
    } catch (error) {
      console.error('Failed to sync project options:', error.message);
      throw error;
    }
  }

  /**
   * Update a single item's Project property in Notion
   */
  async updateItemProject(pageId, projectSlug) {
    return this.updatePage(pageId, {
      'Project': { select: { name: projectSlug } }
    });
  }

  // Parse Notion page into structured item
  static parseItem(page) {
    const props = page.properties || {};

    const getText = (prop) => {
      if (!prop) return '';
      if (prop.type === 'title') return prop.title?.[0]?.plain_text || '';
      if (prop.type === 'rich_text') return prop.rich_text?.[0]?.plain_text || '';
      return '';
    };

    const getSelect = (prop) => prop?.select?.name || '';

    return {
      pageId: page.id,
      url: page.url,
      title: getText(props['Idea/Todo'] || props['Title'] || props['Name']),
      type: getSelect(props['Type']),
      affectedModule: getSelect(props['Affected Module']),
      suggestedPhase: getSelect(props['Suggested Phase']),
      status: getSelect(props['Status']),
      priority: getSelect(props['Priority']),
      project: getSelect(props['Project']),
      description: getText(props['Detailed Description'] || props['Description']),
      capturedDate: props['Captured Date']?.created_time || page.created_time,
      assignedPhase: getSelect(props['Assigned Phase']),
      isHydrated: props['Hydrated']?.checkbox || false
    };
  }
}
