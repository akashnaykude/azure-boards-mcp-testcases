import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import Tesseract from 'tesseract.js';
import { pdf as pdfToImg } from 'pdf-to-img';

const REQUIRED_ENV_VARS = ['AZDO_ORG', 'AZDO_PROJECT', 'AZDO_PAT'];
const DEFAULT_API_VERSION = '7.1-preview.3';
const DEFAULT_COMMENTS_API_VERSION = '7.1-preview.4';

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

  const match = parsedUrl.pathname.match(/\/_workitems\/edit\/(\d+)(?:\/|$)/i);
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

async function downloadAttachment(attachment, headers) {
  const { name, url } = attachment;
  if (!url) return { name, url, content: null, error: 'No URL' };

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      return { name, url, content: null, error: `HTTP ${response.status}` };
    }

    const ext = (name || '').toLowerCase().split('.').pop();

    if (ext === 'xlsx' || ext === 'xls') {
      const buffer = await response.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      const sheets = {};
      for (const sheetName of workbook.SheetNames) {
        sheets[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
      }
      return { name, url, content: sheets, error: null };
    }

    if (ext === 'csv') {
      const text = await response.text();
      const workbook = XLSX.read(text, { type: 'string' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      return { name, url, content: XLSX.utils.sheet_to_json(sheet), error: null };
    }

    if (ext === 'json') {
      const json = await response.json();
      return { name, url, content: json, error: null };
    }

    if (ext === 'txt' || ext === 'md' || ext === 'log') {
      const text = await response.text();
      return { name, url, content: text, error: null };
    }

    if (ext === 'docx') {
      const buffer = await response.arrayBuffer();
      const result = await mammoth.extractRawText({ buffer });
      return { name, url, content: result.value, error: null };
    }

    if (ext === 'pdf') {
      const buffer = await response.arrayBuffer();
      const nodeBuffer = Buffer.from(buffer);
      const parsed = await pdfParse(nodeBuffer);
      const textContent = (parsed.text || '').trim();

      // If no text found, PDF is scanned — render to images and OCR
      if (!textContent) {
        const ocrPages = [];
        const imgDoc = await pdfToImg(nodeBuffer, { scale: 2 });
        for await (const pageImage of imgDoc) {
          const { data: { text } } = await Tesseract.recognize(pageImage, 'eng');
          ocrPages.push(text.trim());
        }
        return { name, url, content: ocrPages.join('\n---\n'), type: 'pdf-ocr', error: null };
      }

      return { name, url, content: textContent, error: null };
    }

    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) {
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      return { name, url, content: `data:${mimeType};base64,${base64}`, type: 'image', error: null };
    }

    // Unsupported binary format - return metadata only
    return { name, url, content: null, error: `Unsupported file type: .${ext}` };
  } catch (err) {
    return { name, url, content: null, error: err.message || 'Download failed' };
  }
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
    throw new Error(
      `Azure DevOps work item API failed (${workItemResponse.status} ${workItemResponse.statusText}). ` +
      'Check AZDO_ORG, AZDO_PROJECT, AZDO_PAT permissions, and the work item ID.'
    );
  }

  const workItem = await workItemResponse.json();

  let comments = [];
  const commentsApiVersion = process.env.AZDO_COMMENTS_API_VERSION || DEFAULT_COMMENTS_API_VERSION;
  const commentsUrl = `https://dev.azure.com/${encodeURIComponent(org)}/${encodedProject}/_apis/wit/workItems/${workItemId}/comments?api-version=${encodeURIComponent(commentsApiVersion)}`;
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
  const relations = workItem.relations || [];

  // Extract inline images from description and acceptance criteria HTML
  const inlineImageUrls = [];
  for (const htmlField of [fields['System.Description'], fields['Microsoft.VSTS.Common.AcceptanceCriteria']]) {
    if (!htmlField) continue;
    const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/gi;
    let match;
    while ((match = imgRegex.exec(htmlField)) !== null) {
      inlineImageUrls.push(match[1]);
    }
  }

  const inlineImages = await Promise.all(
    inlineImageUrls.map((imgUrl) => {
      let fileName = 'inline-image.png';
      try { fileName = new URL(imgUrl).searchParams.get('fileName') || fileName; } catch {}
      return downloadAttachment({ name: fileName, url: imgUrl }, headers);
    })
  );

  // Parse and download attachments from relations
  const attachmentRefs = relations
    .filter((rel) => rel.rel === 'AttachedFile')
    .map((rel) => ({
      name: rel.attributes?.name || null,
      url: rel.url || null
    }));

  const attachments = [
    ...inlineImages,
    ...(await Promise.all(attachmentRefs.map((att) => downloadAttachment(att, headers))))
  ];

  // Parse related work items (parent, child, related) from relations
  const relatedWorkItemRefs = relations
    .filter((rel) => rel.rel !== 'AttachedFile' && rel.rel !== 'ArtifactLink')
    .map((rel) => {
      const idMatch = rel.url?.match(/\/workItems\/(\d+)$/i);
      return {
        id: idMatch ? Number(idMatch[1]) : null,
        linkType: rel.attributes?.name || rel.rel || null,
        url: rel.url || null
      };
    })
    .filter((ref) => ref.id !== null);

  // Fetch titles for related work items in batch
  let relatedWorkItems = [];
  const relatedIds = relatedWorkItemRefs.map((ref) => ref.id);
  if (relatedIds.length > 0) {
    const batchUrl = `https://dev.azure.com/${encodeURIComponent(org)}/${encodedProject}/_apis/wit/workitems?ids=${relatedIds.join(',')}&fields=System.Title,System.WorkItemType,System.State&api-version=${encodeURIComponent(apiVersion)}`;
    const batchResponse = await fetch(batchUrl, { headers });
    const batchLookup = new Map();
    if (batchResponse.ok) {
      const batchData = await batchResponse.json();
      for (const item of (batchData.value || [])) {
        batchLookup.set(item.id, {
          title: item.fields?.['System.Title'] || null,
          workItemType: item.fields?.['System.WorkItemType'] || null,
          state: item.fields?.['System.State'] || null
        });
      }
    }
    relatedWorkItems = relatedWorkItemRefs.map((ref) => ({
      ...ref,
      ...(batchLookup.get(ref.id) || {})
    }));
  }

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
    comments,
    relatedWorkItems,
    attachments
  };
}

const server = new McpServer({
  name: 'azure-boards-mcp-testcases',
  version: '1.0.0'
});

server.registerTool(
  'get_azure_boards_work_item',
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
