import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import Tesseract from 'tesseract.js';
import { pdf as pdfToImg } from 'pdf-to-img';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

// ── Knowledge Base ──────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = resolve(__dirname, '..', 'knowledge');

const KNOWLEDGE_FILES = {
  features: join(KNOWLEDGE_DIR, 'features.json'),
  screens: join(KNOWLEDGE_DIR, 'screens.json'),
  businessRules: join(KNOWLEDGE_DIR, 'business-rules.json'),
  ticketHistory: join(KNOWLEDGE_DIR, 'ticket-history.json'),
  terminology: join(KNOWLEDGE_DIR, 'terminology.json'),
  testCoverage: join(KNOWLEDGE_DIR, 'test-coverage.json')
};

function readKnowledgeFile(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeKnowledgeFile(filePath, data) {
  if (!existsSync(KNOWLEDGE_DIR)) {
    mkdirSync(KNOWLEDGE_DIR, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function mergeArrayById(existing, incoming, idField = 'id') {
  const map = new Map(existing.map((item) => [item[idField], item]));
  for (const item of incoming) {
    const key = item[idField];
    if (map.has(key)) {
      map.set(key, { ...map.get(key), ...item, lastUpdated: new Date().toISOString() });
    } else {
      map.set(key, { ...item, addedOn: new Date().toISOString() });
    }
  }
  return [...map.values()];
}

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

// ── Pull Request Code Extraction ────────────────────────────────────────────

function parsePrArtifactUrl(vstfsUrl) {
  // vstfs:///Git/PullRequestId/{projectId}%2F{repoId}%2F{prId}
  const match = vstfsUrl.match(/vstfs:\/\/\/Git\/PullRequestId\/([^%]+)%2[Ff]([^%]+)%2[Ff](\d+)/i);
  if (!match) return null;
  return { projectId: match[1], repoId: match[2], prId: Number(match[3]) };
}

const MAX_FILE_SIZE_BYTES = 100_000; // skip files larger than 100KB
const RELEVANT_EXTENSIONS = new Set([
  'cs', 'ts', 'js', 'tsx', 'jsx', 'py', 'java', 'kt', 'swift', 'dart',
  'json', 'xml', 'yaml', 'yml', 'feature', 'md', 'sql', 'html', 'css', 'scss'
]);

function isRelevantFile(filePath) {
  if (!filePath) return false;
  const ext = filePath.split('.').pop()?.toLowerCase();
  return RELEVANT_EXTENSIONS.has(ext);
}

async function fetchFileContent(org, repoId, commitId, filePath, headers) {
  try {
    const encodedPath = encodeURIComponent(filePath);
    const url = `https://dev.azure.com/${encodeURIComponent(org)}/_apis/git/repositories/${repoId}/items?path=${encodedPath}&versionDescriptor.version=${commitId}&versionDescriptor.versionType=commit&$format=text&api-version=7.1`;
    const resp = await fetch(url, { headers });
    if (!resp.ok) return null;
    const contentLength = resp.headers.get('content-length');
    if (contentLength && Number(contentLength) > MAX_FILE_SIZE_BYTES) return '(file too large, skipped)';
    const text = await resp.text();
    if (text.length > MAX_FILE_SIZE_BYTES) return text.substring(0, MAX_FILE_SIZE_BYTES) + '\n...(truncated)';
    return text;
  } catch {
    return null;
  }
}

async function fetchPullRequestContext(org, project, relations, headers) {
  const prRefs = relations
    .filter((rel) => rel.rel === 'ArtifactLink' && rel.attributes?.name === 'Pull Request')
    .map((rel) => parsePrArtifactUrl(rel.url))
    .filter(Boolean);

  if (prRefs.length === 0) return [];

  const pullRequests = [];

  for (const { repoId, prId } of prRefs) {
    try {
      // Fetch PR metadata
      const prUrl = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/pullrequests/${prId}?api-version=7.1`;
      const prResp = await fetch(prUrl, { headers });
      if (!prResp.ok) continue;
      const pr = await prResp.json();

      // Fetch PR commits to find the latest
      const commitsUrl = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/pullrequests/${prId}/commits?api-version=7.1`;
      const commitsResp = await fetch(commitsUrl, { headers });
      let latestCommitId = null;
      if (commitsResp.ok) {
        const commitsData = await commitsResp.json();
        latestCommitId = commitsData.value?.[0]?.commitId || null;
      }

      // Fetch changed files from the last iteration
      const iterUrl = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/pullrequests/${prId}/iterations?api-version=7.1`;
      const iterResp = await fetch(iterUrl, { headers });
      let changedFiles = [];
      if (iterResp.ok) {
        const iterData = await iterResp.json();
        const lastIterId = iterData.value?.[iterData.value.length - 1]?.id;
        if (lastIterId) {
          const changesUrl = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/pullrequests/${prId}/iterations/${lastIterId}/changes?api-version=7.1`;
          const changesResp = await fetch(changesUrl, { headers });
          if (changesResp.ok) {
            const changesData = await changesResp.json();
            changedFiles = (changesData.changeEntries || [])
              .filter((e) => e.item?.path)
              .map((e) => ({ path: e.item.path, changeType: e.changeType }));
          }
        }
      }

      // Fetch code content for relevant changed files
      const fileContents = [];
      if (latestCommitId) {
        const relevantFiles = changedFiles.filter((f) => f.changeType !== 'delete' && isRelevantFile(f.path));
        const contentPromises = relevantFiles.map(async (f) => {
          const content = await fetchFileContent(org, repoId, latestCommitId, f.path, headers);
          return { path: f.path, changeType: f.changeType, content };
        });
        fileContents.push(...(await Promise.all(contentPromises)).filter((f) => f.content));
      }

      // Fetch PR review comments
      let reviewComments = [];
      const threadsUrl = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/pullrequests/${prId}/threads?api-version=7.1`;
      const threadsResp = await fetch(threadsUrl, { headers });
      if (threadsResp.ok) {
        const threadsData = await threadsResp.json();
        reviewComments = (threadsData.value || [])
          .filter((t) => t.threadContext?.filePath && t.comments?.length > 0)
          .map((t) => ({
            filePath: t.threadContext.filePath,
            status: t.status || null,
            comments: t.comments.map((c) => c.content).filter(Boolean)
          }));
      }

      pullRequests.push({
        prId,
        title: pr.title || null,
        description: pr.description || null,
        status: pr.status || null,
        sourceBranch: pr.sourceRefName?.replace('refs/heads/', '') || null,
        targetBranch: pr.targetRefName?.replace('refs/heads/', '') || null,
        repository: pr.repository?.name || null,
        createdBy: pr.createdBy?.displayName || null,
        changedFiles,
        fileContents,
        reviewComments
      });
    } catch {
      // Skip PRs that fail to fetch
    }
  }

  return pullRequests;
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

  // Fetch PR context (code changes, descriptions, review comments)
  const pullRequests = await fetchPullRequestContext(org, project, relations, headers);

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
    attachments,
    pullRequests
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

function buildExcelBuffer(testCases) {
  const headers = ['Title', 'Preconditions', 'Steps', 'Expected Result', 'Priority', 'Type', 'Automation Status'];
  const rows = testCases.map((tc) => [
    tc.title || '',
    tc.preconditions || '',
    tc.steps || '',
    tc.expectedResult || '',
    tc.priority || 'Medium',
    tc.type || 'Functional',
    tc.automationStatus || 'None'
  ]);

  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 50 }, { wch: 40 }, { wch: 50 }, { wch: 50 },
    { wch: 10 }, { wch: 15 }, { wch: 20 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Test Cases');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').substring(0, 100);
}

function getOutputDir() {
  if (process.env.TEST_CASES_OUTPUT_DIR) {
    return resolve(process.env.TEST_CASES_OUTPUT_DIR);
  }
  // Default: Desktop/Shoppix Test Cases
  const home = process.env.USERPROFILE || process.env.HOME || '.';
  return join(home, 'Desktop', 'Shoppix Test Cases');
}

server.registerTool(
  'export_test_cases_to_onedrive',
  {
    title: 'Export test cases to Excel',
    description: 'Creates an Excel file with test cases in TestRail format and saves it to the "Shoppix Test Cases" folder on Desktop (or TEST_CASES_OUTPUT_DIR). File is named <functionality>_<dd_mm_yyyy>.xlsx. Opens the file in Explorer after saving.',
    inputSchema: {
      functionalityTitle: z.string().describe('The functionality/feature name for the file name'),
      testCases: z.array(z.object({
        title: z.string(),
        preconditions: z.string().optional().default(''),
        steps: z.string(),
        expectedResult: z.string(),
        priority: z.string().optional().default('Medium'),
        type: z.string().optional().default('Functional'),
        automationStatus: z.string().optional().default('None')
      })).describe('Array of test cases in TestRail format')
    }
  },
  async ({ functionalityTitle, testCases }) => {
    try {
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yyyy = now.getFullYear();
      const dateStr = `${dd}_${mm}_${yyyy}`;
      const fileName = `${sanitizeFileName(functionalityTitle)}_${dateStr}.xlsx`;

      const excelBuffer = buildExcelBuffer(testCases);

      const outputDir = getOutputDir();
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      const filePath = join(outputDir, fileName);
      writeFileSync(filePath, excelBuffer);

      // Open folder in Explorer without blocking the response
      const child = spawn('explorer.exe', ['/select,', filePath], { detached: true, stdio: 'ignore' });
      child.unref();

      return {
        content: [{
          type: 'text',
          text: `Exported ${testCases.length} test cases to Excel.\nFile: ${fileName}\nSaved at: ${filePath}\n\nTo upload to OneDrive: open https://numeratorinternational-my.sharepoint.com/ → Shoppix Test Cases folder → upload this file.`
        }]
      };
    } catch (error) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: error instanceof Error ? error.message : 'Failed to export test cases.'
        }]
      };
    }
  }
);

// ── Knowledge Base Tools ────────────────────────────────────────────────────

server.registerTool(
  'get_app_context',
  {
    title: 'Get accumulated application context',
    description:
      'Returns all accumulated knowledge about the application — features, screens, business rules, terminology, past tickets, and test coverage. Call this BEFORE generating test cases so you can produce richer, more contextual results.',
    inputSchema: {
      sections: z
        .array(z.enum(['features', 'screens', 'businessRules', 'terminology', 'ticketHistory', 'testCoverage']))
        .optional()
        .describe('Which knowledge sections to return. Omit to get everything.')
    }
  },
  async ({ sections }) => {
    try {
      const requested = sections && sections.length > 0 ? sections : Object.keys(KNOWLEDGE_FILES);
      const context = {};
      let totalEntries = 0;

      for (const key of requested) {
        const filePath = KNOWLEDGE_FILES[key];
        if (!filePath) continue;
        const data = readKnowledgeFile(filePath);
        if (!data) continue;
        const listKey = Object.keys(data).find((k) => k !== '_description');
        const entries = listKey ? data[listKey] : [];
        context[key] = entries;
        totalEntries += entries.length;
      }

      if (totalEntries === 0) {
        return {
          content: [{
            type: 'text',
            text: 'Knowledge base is empty. No prior ticket context available yet. This will grow as tickets are processed.'
          }]
        };
      }

      const summary = Object.entries(context)
        .map(([k, v]) => `${k}: ${v.length} entries`)
        .join(', ');

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ summary, ...context }, null, 2)
        }],
        structuredContent: context
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error instanceof Error ? error.message : 'Failed to read app context.' }]
      };
    }
  }
);

server.registerTool(
  'save_ticket_context',
  {
    title: 'Save learned context from a ticket',
    description:
      'After generating test cases from a ticket, call this to persist what was learned — features, screens, business rules, terminology, and test coverage. This makes future test generation smarter.',
    inputSchema: {
      ticketId: z.number().describe('The Azure Boards work item ID'),
      ticketTitle: z.string().describe('The work item title'),
      ticketUrl: z.string().optional().default('').describe('Full URL to the work item'),
      ticketType: z.string().optional().default('').describe('Work item type (Bug, User Story, Task, etc.)'),
      summary: z.string().describe('Brief summary of what the ticket covers'),
      testCaseCount: z.number().optional().default(0).describe('Number of test cases generated'),
      features: z
        .array(z.object({
          id: z.string().describe('Unique feature slug, e.g. "token-balance-display"'),
          name: z.string().describe('Human-readable feature name'),
          description: z.string().optional().default(''),
          module: z.string().optional().default('').describe('App module or area this belongs to')
        }))
        .optional()
        .default([])
        .describe('Features/modules discovered in this ticket'),
      screens: z
        .array(z.object({
          id: z.string().describe('Unique screen slug, e.g. "home-screen"'),
          name: z.string().describe('Human-readable screen name'),
          description: z.string().optional().default(''),
          elements: z.array(z.string()).optional().default([]).describe('Key UI elements on this screen')
        }))
        .optional()
        .default([])
        .describe('UI screens/pages discovered in this ticket'),
      businessRules: z
        .array(z.object({
          id: z.string().describe('Unique rule slug'),
          rule: z.string().describe('The business rule or validation'),
          feature: z.string().optional().default('').describe('Related feature slug')
        }))
        .optional()
        .default([])
        .describe('Business rules or validations discovered'),
      terminology: z
        .array(z.object({
          id: z.string().describe('The term itself as a slug'),
          term: z.string().describe('The term or phrase'),
          definition: z.string().describe('What it means in this application context')
        }))
        .optional()
        .default([])
        .describe('Domain-specific terms discovered'),
      coveredAreas: z
        .array(z.string())
        .optional()
        .default([])
        .describe('Feature slugs that now have test coverage from this ticket')
    }
  },
  async ({ ticketId, ticketTitle, ticketUrl, ticketType, summary, testCaseCount, features, screens, businessRules, terminology, coveredAreas }) => {
    try {
      // 1. Save ticket to history
      const historyData = readKnowledgeFile(KNOWLEDGE_FILES.ticketHistory) || { tickets: [] };
      const ticketEntry = {
        id: String(ticketId),
        ticketId,
        title: ticketTitle,
        url: ticketUrl,
        type: ticketType,
        summary,
        testCaseCount,
        coveredAreas,
        processedOn: new Date().toISOString()
      };
      historyData.tickets = mergeArrayById(historyData.tickets, [ticketEntry]);
      writeKnowledgeFile(KNOWLEDGE_FILES.ticketHistory, historyData);

      // 2. Merge features
      if (features.length > 0) {
        const featData = readKnowledgeFile(KNOWLEDGE_FILES.features) || { features: [] };
        featData.features = mergeArrayById(featData.features, features);
        writeKnowledgeFile(KNOWLEDGE_FILES.features, featData);
      }

      // 3. Merge screens
      if (screens.length > 0) {
        const scrData = readKnowledgeFile(KNOWLEDGE_FILES.screens) || { screens: [] };
        scrData.screens = mergeArrayById(scrData.screens, screens);
        writeKnowledgeFile(KNOWLEDGE_FILES.screens, scrData);
      }

      // 4. Merge business rules
      if (businessRules.length > 0) {
        const rulesData = readKnowledgeFile(KNOWLEDGE_FILES.businessRules) || { rules: [] };
        rulesData.rules = mergeArrayById(rulesData.rules, businessRules);
        writeKnowledgeFile(KNOWLEDGE_FILES.businessRules, rulesData);
      }

      // 5. Merge terminology
      if (terminology.length > 0) {
        const termData = readKnowledgeFile(KNOWLEDGE_FILES.terminology) || { terms: [] };
        termData.terms = mergeArrayById(termData.terms, terminology);
        writeKnowledgeFile(KNOWLEDGE_FILES.terminology, termData);
      }

      // 6. Update test coverage
      if (coveredAreas.length > 0) {
        const covData = readKnowledgeFile(KNOWLEDGE_FILES.testCoverage) || { coverage: [] };
        for (const featureSlug of coveredAreas) {
          const existing = covData.coverage.find((c) => c.id === featureSlug);
          if (existing) {
            existing.ticketIds = [...new Set([...(existing.ticketIds || []), ticketId])];
            existing.lastTestedOn = new Date().toISOString();
            existing.testCount = (existing.testCount || 0) + testCaseCount;
          } else {
            covData.coverage.push({
              id: featureSlug,
              ticketIds: [ticketId],
              lastTestedOn: new Date().toISOString(),
              testCount: testCaseCount
            });
          }
        }
        writeKnowledgeFile(KNOWLEDGE_FILES.testCoverage, covData);
      }

      const saved = [
        features.length > 0 && `${features.length} features`,
        screens.length > 0 && `${screens.length} screens`,
        businessRules.length > 0 && `${businessRules.length} business rules`,
        terminology.length > 0 && `${terminology.length} terms`,
        coveredAreas.length > 0 && `${coveredAreas.length} coverage areas`
      ].filter(Boolean);

      return {
        content: [{
          type: 'text',
          text: `Context saved for ticket #${ticketId} "${ticketTitle}".\nStored: ${saved.length > 0 ? saved.join(', ') : 'ticket history only'}.`
        }]
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error instanceof Error ? error.message : 'Failed to save ticket context.' }]
      };
    }
  }
);

server.registerTool(
  'search_past_tickets',
  {
    title: 'Search past processed tickets',
    description:
      'Search previously processed Azure Boards tickets by keyword, feature, or ticket ID. Useful for finding related past work, avoiding duplicate test cases, and suggesting regression tests.',
    inputSchema: {
      query: z.string().describe('Search keyword — matches against ticket titles, summaries, features, and covered areas'),
      ticketId: z.number().optional().describe('Exact ticket ID to look up')
    }
  },
  async ({ query, ticketId }) => {
    try {
      const historyData = readKnowledgeFile(KNOWLEDGE_FILES.ticketHistory) || { tickets: [] };
      const tickets = historyData.tickets || [];

      if (tickets.length === 0) {
        return {
          content: [{ type: 'text', text: 'No tickets have been processed yet. The knowledge base is empty.' }]
        };
      }

      if (ticketId) {
        const exact = tickets.find((t) => t.ticketId === ticketId);
        if (exact) {
          return { content: [{ type: 'text', text: JSON.stringify(exact, null, 2) }] };
        }
        return { content: [{ type: 'text', text: `No record found for ticket #${ticketId}.` }] };
      }

      const lowerQuery = (query || '').toLowerCase();
      const matches = tickets.filter((t) => {
        const haystack = [
          t.title,
          t.summary,
          ...(t.coveredAreas || []),
          t.type,
          String(t.ticketId)
        ].join(' ').toLowerCase();
        return haystack.includes(lowerQuery);
      });

      if (matches.length === 0) {
        return { content: [{ type: 'text', text: `No past tickets match "${query}".` }] };
      }

      const results = matches.map((t) => ({
        ticketId: t.ticketId,
        title: t.title,
        summary: t.summary,
        testCaseCount: t.testCaseCount,
        processedOn: t.processedOn,
        coveredAreas: t.coveredAreas
      }));

      return {
        content: [{
          type: 'text',
          text: `Found ${results.length} matching ticket(s):\n${JSON.stringify(results, null, 2)}`
        }]
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error instanceof Error ? error.message : 'Failed to search tickets.' }]
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
