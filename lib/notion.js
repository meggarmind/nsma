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

    // Paginate through all results (Notion returns max 100 per request)
    const allResults = [];
    let cursor = null;
    let hasMore = true;

    while (hasMore) {
      const body = { filter, page_size: 100 };
      if (cursor) {
        body.start_cursor = cursor;
      }

      const result = await this.request('POST', `/databases/${databaseId}/query`, body);
      allResults.push(...(result.results || []));

      hasMore = result.has_more || false;
      cursor = result.next_cursor;
    }

    return allResults;
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
   * Generic method to sync options to ANY select property in the database
   * Used for syncing modules to "Affected Module" and phases to "Suggested Phase"/"Assigned Phase"
   *
   * @param {string} databaseId - The Notion database ID
   * @param {string} propertyName - The name of the select property (e.g., "Affected Module")
   * @param {string[]} optionNames - Array of unique option names to add
   * @returns {Promise<{added: string[], existing: string[]}>}
   */
  async syncSelectOptionsToDatabase(databaseId, propertyName, optionNames) {
    try {
      // Fetch current database schema
      const database = await this.request('GET', `/databases/${databaseId}`);

      // Get the target property
      const prop = database.properties?.[propertyName];
      if (!prop || prop.type !== 'select') {
        console.warn(`${propertyName} property not found or not a select type`);
        return { added: [], existing: [] };
      }

      const existingOptions = prop.select?.options || [];
      const existingNames = new Set(existingOptions.map(o => o.name));

      // Find new options to add (filter empty strings)
      const newOptions = optionNames.filter(name =>
        name && name.trim() && !existingNames.has(name)
      );

      if (newOptions.length === 0) {
        return { added: [], existing: [...existingNames] };
      }

      // Update database with merged options
      await this.request('PATCH', `/databases/${databaseId}`, {
        properties: {
          [propertyName]: {
            select: {
              options: [...existingOptions, ...newOptions.map(name => ({ name }))]
            }
          }
        }
      });

      return {
        added: newOptions,
        existing: [...existingNames]
      };
    } catch (error) {
      console.error(`Failed to sync ${propertyName} options:`, error.message);
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

  /**
   * List all databases the integration has access to
   * Uses Notion's /search endpoint with database filter
   * @returns {Promise<Array<{id: string, title: string}>>}
   */
  async listDatabases() {
    const result = await this.request('POST', '/search', {
      filter: {
        value: 'database',
        property: 'object'
      },
      page_size: 100
    });

    return (result.results || []).map(db => ({
      id: db.id,
      title: db.title?.[0]?.plain_text || 'Untitled'
    }));
  }

  /**
   * Find a page by exact title match
   * @param {string} title - The page title to search for
   * @returns {Promise<Object|null>} - The page object or null if not found
   */
  async findPageByTitle(title) {
    const result = await this.request('POST', '/search', {
      query: title,
      filter: {
        value: 'page',
        property: 'object'
      },
      page_size: 100
    });

    // Find exact title match
    return result.results?.find(page => {
      const pageTitle = page.properties?.title?.title?.[0]?.plain_text;
      return pageTitle === title;
    }) || null;
  }

  /**
   * Get database info including its parent
   * @param {string} databaseId - The database ID
   * @returns {Promise<Object>} - Database info with parent
   */
  async getDatabase(databaseId) {
    return this.request('GET', `/databases/${databaseId}`);
  }

  /**
   * Create a new page under a parent page
   * @param {string} parentPageId - Parent page ID
   * @param {string} title - Page title
   * @returns {Promise<Object>} - Created page object
   */
  async createPage(parentPageId, title) {
    return this.request('POST', '/pages', {
      parent: { page_id: parentPageId },
      properties: {
        title: {
          title: [{ type: 'text', text: { content: title } }]
        }
      }
    });
  }

  /**
   * Create a new page in a database (as a database item)
   * @param {string} databaseId - Database ID
   * @param {string} title - Page title
   * @returns {Promise<Object>} - Created page object
   */
  async createDatabasePage(databaseId, title) {
    return this.request('POST', '/pages', {
      parent: { database_id: databaseId },
      properties: {
        'Idea/Todo': {
          title: [{ type: 'text', text: { content: title } }]
        }
      }
    });
  }

  /**
   * Delete all blocks from a page
   * @param {string} pageId - The page to clear
   */
  async clearPageContent(pageId) {
    const blocks = await this.getPageBlocks(pageId);
    for (const block of blocks) {
      await this.request('DELETE', `/blocks/${block.id}`);
    }
  }

  /**
   * Append blocks to a page
   * @param {string} pageId - The page ID
   * @param {Array} blocks - Array of block objects
   */
  async appendBlocks(pageId, blocks) {
    return this.request('PATCH', `/blocks/${pageId}/children`, {
      children: blocks
    });
  }

  /**
   * Sync project slugs to a dedicated Notion page
   * Creates or updates "NSM Project Slugs" page with project name → slug mappings
   * @param {string} databaseId - The NSM Inbox database ID (to find parent)
   * @param {Array<{name: string, slug: string}>} projects - Array of projects
   * @param {string|null} existingPageId - Existing page ID from settings (optional)
   * @returns {Promise<{pageId: string, created: boolean}>}
   */
  async syncProjectSlugsPage(databaseId, projects, existingPageId = null) {
    const PAGE_TITLE = 'NSM Project Slugs';
    let pageId = existingPageId;
    let created = false;

    // Step 1: Find or create the page
    if (!pageId) {
      // Try to find existing page by title
      const existingPage = await this.findPageByTitle(PAGE_TITLE);
      if (existingPage) {
        pageId = existingPage.id;
      } else {
        // Create new page - try database parent first, fall back to database item
        const database = await this.getDatabase(databaseId);
        const parentId = database.parent?.page_id;

        if (parentId) {
          // Create as sibling of database (under same parent)
          const newPage = await this.createPage(parentId, PAGE_TITLE);
          pageId = newPage.id;
        } else {
          // Database is at workspace root - create as database item
          const newPage = await this.createDatabasePage(databaseId, PAGE_TITLE);
          pageId = newPage.id;
        }
        created = true;
      }
    }

    // Step 2: Clear existing content
    await this.clearPageContent(pageId);

    // Step 3: Build content blocks
    const blocks = [
      // Header paragraph
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{
            type: 'text',
            text: { content: 'Project name, slug, modules, and phases mapping for Claude prompts.' },
            annotations: { italic: true, color: 'gray' }
          }]
        }
      },
      // Divider
      { object: 'block', type: 'divider', divider: {} },
      // Table header
      {
        object: 'block',
        type: 'table',
        table: {
          table_width: 4,
          has_column_header: true,
          has_row_header: false,
          children: [
            // Header row
            {
              type: 'table_row',
              table_row: {
                cells: [
                  [{ type: 'text', text: { content: 'Project Name' }, annotations: { bold: true } }],
                  [{ type: 'text', text: { content: 'Slug' }, annotations: { bold: true } }],
                  [{ type: 'text', text: { content: 'Modules' }, annotations: { bold: true } }],
                  [{ type: 'text', text: { content: 'Phases' }, annotations: { bold: true } }]
                ]
              }
            },
            // Data rows
            ...projects.map(p => ({
              type: 'table_row',
              table_row: {
                cells: [
                  [{ type: 'text', text: { content: p.name } }],
                  [{ type: 'text', text: { content: p.slug }, annotations: { code: true } }],
                  [{ type: 'text', text: { content: p.modules || '' } }],
                  [{ type: 'text', text: { content: p.phases || '' } }]
                ]
              }
            }))
          ]
        }
      },
      // Timestamp
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{
            type: 'text',
            text: { content: `Last updated: ${new Date().toISOString()}` },
            annotations: { italic: true, color: 'gray' }
          }]
        }
      }
    ];

    // Step 4: Append new content
    await this.appendBlocks(pageId, blocks);

    return { pageId, created };
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
      isHydrated: props['Hydrated']?.checkbox === true ||
                  getSelect(props['Hydrated']) === 'Yes'
    };
  }
}
