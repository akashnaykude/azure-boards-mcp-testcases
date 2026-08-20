import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const { AZDO_ORG, AZDO_PROJECT, AZDO_PAT } = process.env;

function ensureEnv() {
  const missing = ['AZDO_ORG', 'AZDO_PROJECT', 'AZDO_PAT'].filter((name) => !process.env[name]);

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

function toHtmlUrl(id) {
  return `https://dev.azure.com/${AZDO_ORG}/${AZDO_PROJECT}/_workitems/edit/${id}`;
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
  return typeof value === 'string' ? value.trim() : '';
}

function mapWorkItem(workItem, comments = []) {
  const fields = workItem?.fields || {};
  return {
    id: workItem.id,
    url: toHtmlUrl(workItem.id),
    title: cleanString(fields['System.Title']),
    description: cleanString(fields['System.Description']),
    acceptanceCriteria: cleanString(fields['Microsoft.VSTS.Common.AcceptanceCriteria']),
    state: cleanString(fields['System.State']),
    tags: cleanString(fields['System.Tags'])
      .split(';')
      .map((tag) => tag.trim())
      .filter(Boolean),
    workItemType: cleanString(fields['System.WorkItemType']),
    assignedTo: cleanString(fields['System.AssignedTo']?.displayName || fields['System.AssignedTo']?.uniqueName),
    comments: comments
      .map((comment) => cleanString(comment.text))
      .filter(Boolean)
  };
}

async function azdoFetch(path) {
  const auth = Buffer.from(`:${AZDO_PAT}`).toString('base64');
  const response = await fetch(`https://dev.azure.com/${AZDO_ORG}/${AZDO_PROJECT}/_apis/wit/${path}`, {
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
    ensureEnv();

    const id = getWorkItemId(ticket.trim());
    if (!id) {
      throw new Error('Could not extract work item ID. Provide a numeric ID or a valid Azure Boards work item URL.');
    }

    const workItem = await azdoFetch(`workitems/${id}?api-version=7.1`);
    const commentsResponse = await azdoFetch(`workItems/${id}/comments?$top=20&api-version=7.1-preview.4`);
    const mapped = mapWorkItem(workItem, commentsResponse?.comments || []);

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
