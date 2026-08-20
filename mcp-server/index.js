import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

function ensureEnv() {
  const missing = ['AZDO_ORG', 'AZDO_PROJECT', 'AZDO_PAT'].filter((name) => !process.env[name]?.trim());

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    org: process.env.AZDO_ORG.trim(),
    project: process.env.AZDO_PROJECT.trim(),
    pat: process.env.AZDO_PAT.trim()
  };
}

function toHtmlUrl(id, org, project) {
  return `https://dev.azure.com/${org}/${project}/_workitems/edit/${id}`;
}

function getWorkItemId(ticket) {
  if (/^\d+$/.test(ticket)) {
    return Number(ticket);
  }

  try {
    const parsed = new URL(ticket);
    const match = parsed.pathname.match(/_workitems\/edit\/(\d+)/i);
    if (match?.[1]) {
      return Number(match[1]);
    }
  } catch {
    // ticket is not a URL
  }

  return null;
}

function cleanString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapWorkItem(workItem, org, project, comments = []) {
  const fields = workItem?.fields || {};
  return {
    id: workItem.id,
    url: toHtmlUrl(workItem.id, org, project),
    title: cleanString(fields['System.Title']),
    description: cleanString(fields['System.Description']),
    acceptanceCriteria: cleanString(fields['Microsoft.VSTS.Common.AcceptanceCriteria']),
    state: cleanString(fields['System.State']),
    tags: cleanString(fields['System.Tags'])
      .split(';')
      .map((tag) => tag.trim())
      .filter(Boolean),
    workItemType: cleanString(fields['System.WorkItemType']),
    assignedTo: cleanString(
      typeof fields['System.AssignedTo'] === 'string'
        ? fields['System.AssignedTo']
        : (fields['System.AssignedTo']?.displayName || fields['System.AssignedTo']?.uniqueName || '')
    ),
    comments: comments
      .map((comment) => cleanString(comment.text))
      .filter(Boolean)
  };
}

async function azdoFetch(path, org, project, pat) {
  const auth = Buffer.from(`:${pat}`).toString('base64');
  const response = await fetch(`https://dev.azure.com/${org}/${project}/_apis/wit/${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${auth}`
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Azure Boards request failed (${response.status}): ${body}`);
  }

  return response.json();
}

let env;
try {
  env = ensureEnv();
} catch (error) {
  process.stderr.write(`[azure-boards-mcp] ${error.message}\n`);
  process.exit(1);
}

const server = new McpServer({
  name: 'azure-boards-workitem-mcp',
  version: '1.0.0'
});

server.tool(
  'get_work_item',
  'Fetch an Azure Boards work item using a ticket ID or Azure Boards URL.',
  {
    ticket: z.string().min(1).describe('Work item ID (e.g. 209974) or Azure Boards URL.')
  },
  async ({ ticket }) => {
    const { org, project, pat } = env;
    const id = getWorkItemId(ticket.trim());
    if (!id) {
      throw new Error('Could not extract work item ID. Provide a numeric ID or a valid Azure Boards work item URL.');
    }

    const workItem = await azdoFetch(`workItems/${id}?api-version=7.1`, org, project, pat);
    // Azure Boards work item comments endpoint currently requires a preview API version.
    const commentsResponse = await azdoFetch(`workItems/${id}/comments?$top=20&api-version=7.1-preview.4`, org, project, pat);
    const mapped = mapWorkItem(workItem, org, project, commentsResponse?.comments || []);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(mapped, null, 2)
        }
      ]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
