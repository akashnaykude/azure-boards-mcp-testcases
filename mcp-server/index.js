import http from 'node:http';
import https from 'node:https';

const port = process.env.PORT || 3000;

class AzdoError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Parse an Azure Boards work item ID from either a numeric ID or a full URL.
 * Supported URL formats:
 *   https://dev.azure.com/{org}/{project}/_workitems/edit/{id}
 *   https://{org}.visualstudio.com/{project}/_workitems/edit/{id}
 * Returns the numeric ID as a string, or null if not parseable.
 */
function parseWorkItemId(input) {
  if (!input) return null;
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/_workitems\/edit\/(\d+)/);
  if (urlMatch) return urlMatch[1];
  if (/^\d+$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * Fetch a work item from Azure Boards REST API.
 * Requires AZDO_ORG, AZDO_PROJECT, AZDO_PAT environment variables.
 */
function fetchWorkItem(id) {
  const org = process.env.AZDO_ORG;
  const project = process.env.AZDO_PROJECT;
  const pat = process.env.AZDO_PAT;

  if (!org || !project || !pat) {
    return Promise.reject(new AzdoError('Missing required environment variables: AZDO_ORG, AZDO_PROJECT, AZDO_PAT', 503));
  }

  const token = Buffer.from(`:${pat}`).toString('base64');
  const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/wit/workitems/${encodeURIComponent(id)}?$expand=all&api-version=7.1`;

  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        Authorization: `Basic ${token}`,
        Accept: 'application/json',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new AzdoError('Invalid JSON response from Azure DevOps', 500));
          }
        } else if (res.statusCode === 401) {
          reject(new AzdoError('Unauthorized: check AZDO_PAT', 401));
        } else if (res.statusCode === 404) {
          reject(new AzdoError(`Work item ${id} not found`, 404));
        } else {
          reject(new AzdoError(`Azure DevOps API returned status ${res.statusCode}`, 500));
        }
      });
    }).on('error', (err) => reject(new AzdoError(err.message, 500)));
  });
}

/**
 * Extract the fields most useful for QA test case generation.
 */
function summariseWorkItem(raw) {
  const f = raw.fields || {};
  return {
    id: raw.id,
    url: raw._links?.html?.href ?? null,
    type: f['System.WorkItemType'] ?? null,
    state: f['System.State'] ?? null,
    title: f['System.Title'] ?? null,
    description: f['System.Description'] ?? null,
    acceptanceCriteria: f['Microsoft.VSTS.Common.AcceptanceCriteria'] ?? null,
    tags: f['System.Tags'] ?? null,
    priority: f['Microsoft.VSTS.Common.Priority'] ?? null,
    areaPath: f['System.AreaPath'] ?? null,
    iterationPath: f['System.IterationPath'] ?? null,
  };
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${port}`);

  if (reqUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (reqUrl.pathname === '/work-item') {
    // Accept ?id=<numeric id> or ?url=<full Azure Boards URL>
    const rawId = reqUrl.searchParams.get('id') || reqUrl.searchParams.get('url');
    const id = parseWorkItemId(rawId);

    if (!id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Missing or invalid work item reference. Provide ?id=<number> or ?url=<Azure Boards URL>.',
      }));
      return;
    }

    try {
      const raw = await fetchWorkItem(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(summariseWorkItem(raw)));
    } catch (err) {
      const status = err instanceof AzdoError ? err.statusCode : 500;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found. Available endpoints: GET /work-item?id=<id> or GET /work-item?url=<Azure Boards URL>' }));
});

server.listen(port, () => {
  console.log(`Azure Boards MCP server running on port ${port}`);
  if (!process.env.AZDO_ORG || !process.env.AZDO_PROJECT || !process.env.AZDO_PAT) {
    console.warn('Warning: AZDO_ORG, AZDO_PROJECT, or AZDO_PAT environment variables are not set.');
  }
});
