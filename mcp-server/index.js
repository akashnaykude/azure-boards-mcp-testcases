import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const REQUIRED_ENV_VARS = ['AZDO_ORG', 'AZDO_PROJECT', 'AZDO_PAT'];
const DEFAULT_API_VERSION = '7.1-preview.3';

function getMissingEnvVars() {
  return REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
}

function parseWorkItemId(ticket) {
  if (typeof ticket !== 'string' || !ticket.trim()) {
    throw new Error('Missing work item ID or Azure Boards URL.');
  }

  const normalizedTicket = ticket.trim();

  if (/^\d+$/.test(normalizedTicket)) {
    return Number(normalizedTicket);
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(normalizedTicket);
  } catch {
    throw new Error('Invalid Azure Boards URL. Provide a numeric ID or a valid URL.');
  }

  const match = parsedUrl.pathname.match(/\/workitems\/edit\/(\d+)(?:\/|$)/i);
  if (!match) {
    throw new Error('Invalid Azure Boards URL. Expected path like /_workitems/edit/<id>.');
  }

  return Number(match[1]);
}

function buildAuthHeaders() {
  const pat = process.env.AZDO_PAT;
  const encodedPat = Buffer.from(`:${pat}`).toString('base64');
  return {
    Authorization: `Basic ${encodedPat}`,
    Accept: 'application/json'
  };
}

async function fetchWorkItem(workItemId) {
  const missingEnvVars = getMissingEnvVars();
  if (missingEnvVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  }

  const org = process.env.AZDO_ORG;
  const project = process.env.AZDO_PROJECT;
  const apiVersion = process.env.AZDO_API_VERSION || DEFAULT_API_VERSION;
  const headers = buildAuthHeaders();
  const encodedProject = encodeURIComponent(project);

  const workItemUrl = `https://dev.azure.com/${encodeURIComponent(org)}/${encodedProject}/_apis/wit/workitems/${workItemId}?$expand=all&api-version=${encodeURIComponent(apiVersion)}`;
  const workItemResponse = await fetch(workItemUrl, { headers });

  if (!workItemResponse.ok) {
    const responseText = await workItemResponse.text();
    throw new Error(`Azure DevOps work item API failed (${workItemResponse.status} ${workItemResponse.statusText}): ${responseText}`);
  }

  const workItem = await workItemResponse.json();

  let comments = [];
  const commentsUrl = `https://dev.azure.com/${encodeURIComponent(org)}/${encodedProject}/_apis/wit/workItems/${workItemId}/comments?api-version=7.1-preview.4`;
  const commentsResponse = await fetch(commentsUrl, { headers });

  if (commentsResponse.ok) {
    const commentsPayload = await commentsResponse.json();
    comments = (commentsPayload.comments || []).map((comment) => ({
      id: comment.id,
      text: comment.text,
      createdBy: comment.createdBy?.displayName || null,
      createdDate: comment.createdDate || null
    }));
  }

  const fields = workItem.fields || {};

  return {
    id: workItem.id,
    url: workItem.url,
    workItemType: fields['System.WorkItemType'] || null,
    title: fields['System.Title'] || null,
    description: fields['System.Description'] || null,
    acceptanceCriteria: fields['Microsoft.VSTS.Common.AcceptanceCriteria'] || null,
    state: fields['System.State'] || null,
    tags: fields['System.Tags']
      ? fields['System.Tags'].split(';').map((tag) => tag.trim()).filter(Boolean)
      : [],
    assignee: fields['System.AssignedTo']?.displayName || null,
    comments
  };
}

const server = new McpServer({
  name: 'azure-boards-mcp-testcases',
  version: '1.0.0'
});

server.registerTool(
  'get_azure_board_work_item',
  {
    title: 'Get Azure Boards work item',
    description: 'Fetches Azure Boards work item details from a work item ID or URL for QA test case generation.',
    inputSchema: {
      ticket: z.string().describe('Azure Boards work item ID or URL (for example: 209974 or https://dev.azure.com/.../_workitems/edit/209974)')
    }
  },
  async ({ ticket }) => {
    try {
      const workItemId = parseWorkItemId(ticket);
      const workItem = await fetchWorkItem(workItemId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(workItem, null, 2)
          }
        ],
        structuredContent: workItem
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: error instanceof Error ? error.message : 'Unknown error while fetching Azure Boards work item.'
          }
        ]
      };
    }
  }
);

async function startServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

startServer().catch((error) => {
  console.error('Failed to start Azure Boards MCP server:', error);
  process.exit(1);
});
