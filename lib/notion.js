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

  async request(method, endpoint, body = null) {
    const options = {
      method,
      headers: this.headers
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, options);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Notion API error: ${response.status} - ${error}`);
    }

    return response.json();
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
    const result = await this.request('GET', `/blocks/${pageId}/children?page_size=100`);
    return result.results || [];
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
