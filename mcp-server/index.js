import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------
const REQUIRED_ENV = ['AZDO_ORG', 'AZDO_PROJECT', 'AZDO_PAT'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill in your Azure DevOps values.');
  process.exit(1);
}

const ORG = process.env.AZDO_ORG;
const PROJECT = encodeURIComponent(process.env.AZDO_PROJECT);
const PAT = process.env.AZDO_PAT;
const PORT = process.env.PORT || 3000;
const API_VERSION = '7.1';

// ---------------------------------------------------------------------------
// Helper – Azure DevOps REST request
// ---------------------------------------------------------------------------
function azureGet(path) {
  return new Promise((resolve, reject) => {
    const url = `https://dev.azure.com/${ORG}/${PROJECT}/_apis/${path}?api-version=${API_VERSION}`;
    const token = Buffer.from(`:${PAT}`).toString('base64');
    const options = {
      headers: {
        Authorization: `Basic ${token}`,
        Accept: 'application/json',
      },
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            reject(new Error('Failed to parse Azure DevOps response as JSON'));
          }
        } else {
          const err = new Error(`Azure DevOps API returned ${res.statusCode}: ${data}`);
          err.statusCode = res.statusCode;
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Work-item field extraction
// ---------------------------------------------------------------------------
function extractWorkItem(raw) {
  const f = raw.fields || {};
  return {
    id: raw.id,
    url: raw._links?.html?.href ?? `https://dev.azure.com/${ORG}/${process.env.AZDO_PROJECT}/_workitems/edit/${raw.id}`,
    type: f['System.WorkItemType'] ?? null,
    state: f['System.State'] ?? null,
    title: f['System.Title'] ?? null,
    description: f['System.Description'] ?? null,
    acceptanceCriteria: f['Microsoft.VSTS.Common.AcceptanceCriteria'] ?? null,
    tags: f['System.Tags'] ?? null,
    assignedTo: f['System.AssignedTo']?.displayName ?? null,
    areaPath: f['System.AreaPath'] ?? null,
    iterationPath: f['System.IterationPath'] ?? null,
    priority: f['Microsoft.VSTS.Common.Priority'] ?? null,
    createdBy: f['System.CreatedBy']?.displayName ?? null,
    createdDate: f['System.CreatedDate'] ?? null,
    changedDate: f['System.ChangedDate'] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------
function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body, null, 2));
}

async function handleHealth(res) {
  sendJson(res, 200, {
    status: 'ok',
    org: ORG,
    project: process.env.AZDO_PROJECT,
    timestamp: new Date().toISOString(),
  });
}

async function handleWorkItem(reqUrl, res) {
  const { searchParams } = new URL(reqUrl, `http://localhost:${PORT}`);
  const id = searchParams.get('id');

  if (!id || !/^\d+$/.test(id)) {
    sendJson(res, 400, { error: 'Query parameter "id" must be a numeric work-item ID.' });
    return;
  }

  try {
    const { body } = await azureGet(`wit/workitems/${id}`);
    sendJson(res, 200, extractWorkItem(body));
  } catch (err) {
    const status = err.statusCode === 404 ? 404 : 502;
    sendJson(res, status, { error: err.message });
  }
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method Not Allowed. Only GET requests are supported.' });
    return;
  }

  try {
    if (pathname === '/health') {
      await handleHealth(res);
    } else if (pathname === '/work-item') {
      await handleWorkItem(req.url, res);
    } else {
      sendJson(res, 404, {
        error: 'Not found',
        availableRoutes: [
          'GET /health',
          'GET /work-item?id=<workItemId>',
        ],
      });
    }
  } catch (err) {
    sendJson(res, 500, { error: 'Internal server error', detail: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Azure Boards MCP server running on port ${PORT}`);
  console.log(`  org:     ${ORG}`);
  console.log(`  project: ${process.env.AZDO_PROJECT}`);
  console.log(`  health:  http://localhost:${PORT}/health`);
  console.log(`  example: http://localhost:${PORT}/work-item?id=209974`);
});
