import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const port = process.env.PORT || 3000;

/**
 * Extract the numeric work item ID from an Azure Boards URL or plain ID string.
 * Accepts:
 *   - https://dev.azure.com/<org>/<project>/_workitems/edit/<id>
 *   - https://dev.azure.com/<org>/<project>/_workitems/edit/<id>?...
 *   - Plain numeric string, e.g. "209974"
 */
function extractWorkItemId(input) {
  if (!input) return null;
  input = String(input).trim();

  // Try to parse as an Azure Boards URL
  try {
    const parsed = new URL(input);
    const match = parsed.pathname.match(/_workitems\/edit\/(\d+)/i);
    if (match) return match[1];
  } catch {
    // Not a URL, fall through
  }

  // Accept a plain numeric ID
  if (/^\d+$/.test(input)) return input;

  return null;
}

/**
 * Make an HTTPS GET request and return the parsed JSON body.
 */
function httpsGetJson(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          let msg = `Azure DevOps API returned ${res.statusCode}`;
          try {
            const parsed = JSON.parse(body);
            if (parsed.message) msg += `: ${parsed.message}`;
          } catch { /* ignore */ }
          reject(new Error(msg));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Invalid JSON response from Azure DevOps API'));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Fetch a work item from Azure DevOps REST API.
 * Returns a structured object with fields useful for test-case generation.
 */
async function fetchWorkItem(workItemId) {
  const { AZDO_ORG, AZDO_PROJECT, AZDO_PAT } = process.env;
  if (!AZDO_ORG || !AZDO_PROJECT || !AZDO_PAT) {
    throw new Error(
      'Missing required environment variables: AZDO_ORG, AZDO_PROJECT, AZDO_PAT. ' +
      'Copy .env.example to .env and fill in your Azure DevOps credentials.'
    );
  }

  const token = Buffer.from(`:${AZDO_PAT}`).toString('base64');
  const headers = {
    Authorization: `Basic ${token}`,
    'Content-Type': 'application/json',
  };

  const baseUrl =
    `https://dev.azure.com/${encodeURIComponent(AZDO_ORG)}/` +
    `${encodeURIComponent(AZDO_PROJECT)}/_apis/wit/workitems/${workItemId}`;

  // Fetch main work item fields
  const workItem = await httpsGetJson(
    `${baseUrl}?$expand=all&api-version=7.0`,
    headers
  );

  const fields = workItem.fields || {};

  // Fetch comments (best-effort — may not exist on all plans)
  let comments = [];
  try {
    const commentsData = await httpsGetJson(
      `${baseUrl}/comments?api-version=7.0-preview.3`,
      headers
    );
    comments = (commentsData.comments || []).map((c) => ({
      author: c.createdBy?.displayName || '',
      date: c.createdDate || '',
      text: c.text || '',
    }));
  } catch {
    // Comments endpoint may be unavailable; ignore
  }

  return {
    id: workItemId,
    url: `https://dev.azure.com/${AZDO_ORG}/${AZDO_PROJECT}/_workitems/edit/${workItemId}`,
    type: fields['System.WorkItemType'] || '',
    title: fields['System.Title'] || '',
    state: fields['System.State'] || '',
    assignedTo: fields['System.AssignedTo']?.displayName || fields['System.AssignedTo'] || '',
    areaPath: fields['System.AreaPath'] || '',
    iterationPath: fields['System.IterationPath'] || '',
    tags: fields['System.Tags'] || '',
    description: fields['System.Description'] || '',
    acceptanceCriteria: fields['Microsoft.VSTS.Common.AcceptanceCriteria'] || '',
    priority: fields['Microsoft.VSTS.Common.Priority'] ?? '',
    severity: fields['Microsoft.VSTS.Common.Severity'] || '',
    reproSteps: fields['Microsoft.VSTS.TCM.ReproSteps'] || '',
    comments,
  };
}

/**
 * Strip HTML tags from a string for cleaner plain-text output.
 * Uses a single-pass replacement so no `<` characters survive.
 */
function stripHtml(str) {
  if (!str) return '';
  const entities = { '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'" };
  // Single pass: convert block tags to newlines, strip all other tags/angle brackets
  const noTags = str.replace(/<[^>]*>?|</g, (match) => {
    if (/^<br\s*\/?>$/i.test(match) || /^<\/p>$/i.test(match)) return '\n';
    return '';
  });
  return noTags.replace(/&(?:nbsp|lt|gt|amp|quot|#39);/g, (m) => entities[m] || m).trim();
}

/**
 * Generate a structured list of QA test case titles from work item data.
 * This produces a table-ready list based on title, description, and AC.
 */
function generateTestCases(workItem) {
  const testCases = [];
  let id = 1;

  const title = workItem.title || 'Feature';
  const acText = stripHtml(workItem.acceptanceCriteria);
  const descText = stripHtml(workItem.description);
  const reproText = stripHtml(workItem.reproSteps);

  // Parse acceptance criteria lines into individual cases
  if (acText) {
    const lines = acText
      .split(/\n|;/)
      .map((l) => l.trim())
      .filter((l) => l.length > 5);

    for (const line of lines) {
      // Remove leading bullets/numbers
      const clean = line.replace(/^[-*•\d.]+\s*/, '').trim();
      if (!clean) continue;

      testCases.push({
        id: `TC-${String(id++).padStart(3, '0')}`,
        type: 'Positive',
        title: `Verify: ${clean}`,
        preconditions: `Work item ${workItem.id} is accessible and user is logged in`,
        steps: `1. Navigate to the feature\n2. ${clean}`,
        expectedResult: 'Feature behaves as described in acceptance criteria',
        priority: workItem.priority || 'Medium',
      });
    }
  }

  // Negative case from description or AC
  if (descText || acText) {
    testCases.push({
      id: `TC-${String(id++).padStart(3, '0')}`,
      type: 'Negative',
      title: `Verify error handling for invalid input on: ${title}`,
      preconditions: 'User is logged in',
      steps: '1. Navigate to the feature\n2. Provide invalid or empty input\n3. Submit',
      expectedResult: 'Appropriate error message is shown; data is not saved',
      priority: 'High',
    });

    testCases.push({
      id: `TC-${String(id++).padStart(3, '0')}`,
      type: 'Negative',
      title: `Verify behavior when required fields are missing: ${title}`,
      preconditions: 'User is logged in',
      steps: '1. Navigate to the feature\n2. Leave required fields blank\n3. Attempt to proceed',
      expectedResult: 'Validation errors are displayed for each missing required field',
      priority: 'High',
    });
  }

  // Repro steps — convert to a test case if present (bug type work items)
  if (reproText) {
    testCases.push({
      id: `TC-${String(id++).padStart(3, '0')}`,
      type: 'Regression',
      title: `Regression: verify bug fix for ${title}`,
      preconditions: 'User is on the affected page/feature',
      steps: reproText,
      expectedResult: 'Bug is no longer reproducible after the fix',
      priority: 'High',
    });
  }

  // Edge cases
  testCases.push({
    id: `TC-${String(id++).padStart(3, '0')}`,
    type: 'Edge',
    title: `Verify boundary/edge conditions for: ${title}`,
    preconditions: 'User is logged in',
    steps: '1. Navigate to the feature\n2. Enter boundary values (min, max, special characters)',
    expectedResult: 'System handles edge values gracefully without crash or data loss',
    priority: 'Medium',
  });

  // Accessibility
  testCases.push({
    id: `TC-${String(id++).padStart(3, '0')}`,
    type: 'Accessibility',
    title: `Verify accessibility compliance for: ${title}`,
    preconditions: 'Feature is accessible in browser',
    steps: '1. Navigate to the feature\n2. Use keyboard navigation only\n3. Check screen reader output\n4. Verify color contrast',
    expectedResult: 'Feature is accessible via keyboard; screen reader announces correctly; contrast ratio meets WCAG 2.1 AA',
    priority: 'Medium',
  });

  return testCases;
}

// ---- HTTP Server ----

function parseQueryParams(reqUrl) {
  try {
    return Object.fromEntries(new URL(reqUrl, 'http://localhost').searchParams);
  } catch {
    return {};
  }
}

/** Extract work item ID from the request URL's query parameters. */
function resolveWorkItemId(reqUrl) {
  const { url: inputUrl, id: inputId } = parseQueryParams(reqUrl);
  return extractWorkItemId(inputUrl || inputId);
}

/** Map an Azure DevOps API error to the appropriate HTTP status code. */
function apiErrorStatus(err) {
  if (err.message.includes('Missing required environment')) return 500;
  if (err.message.includes('404')) return 404;
  if (err.message.includes('403')) return 403;
  if (err.message.includes('401')) return 401;
  return 500;
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://localhost:${port}`);
  const path = parsed.pathname;

  // GET /
  if (path === '/' && req.method === 'GET') {
    return sendJson(res, 200, {
      name: 'azure-boards-mcp-testcases',
      status: 'running',
      endpoints: {
        '/work-item': 'Fetch Azure Boards work item. Query params: ?url=<Azure Boards URL>  OR  ?id=<work item ID>',
        '/generate-test-cases': 'Fetch work item and generate QA test cases. Same query params as /work-item',
      },
      example: 'GET /generate-test-cases?url=https://dev.azure.com/org/project/_workitems/edit/12345',
    });
  }

  // GET /work-item  — fetch and return raw structured work item
  if (path === '/work-item' && req.method === 'GET') {
    const workItemId = resolveWorkItemId(req.url);
    if (!workItemId) {
      return sendJson(res, 400, {
        error: 'Missing or invalid input. Provide ?url=<Azure Boards URL> or ?id=<numeric work item ID>',
        example: '/work-item?url=https://dev.azure.com/org/project/_workitems/edit/209974',
      });
    }

    try {
      const workItem = await fetchWorkItem(workItemId);
      return sendJson(res, 200, workItem);
    } catch (err) {
      return sendJson(res, apiErrorStatus(err), { error: err.message });
    }
  }

  // GET /generate-test-cases — fetch work item and produce test cases
  if (path === '/generate-test-cases' && req.method === 'GET') {
    const workItemId = resolveWorkItemId(req.url);
    if (!workItemId) {
      return sendJson(res, 400, {
        error: 'Missing or invalid input. Provide ?url=<Azure Boards URL> or ?id=<numeric work item ID>',
        example: '/generate-test-cases?url=https://dev.azure.com/org/project/_workitems/edit/209974',
      });
    }

    try {
      const workItem = await fetchWorkItem(workItemId);
      const testCases = generateTestCases(workItem);
      return sendJson(res, 200, {
        workItem: {
          id: workItem.id,
          type: workItem.type,
          title: workItem.title,
          state: workItem.state,
          assignedTo: workItem.assignedTo,
          tags: workItem.tags,
          url: workItem.url,
        },
        testCases,
        generatedAt: new Date().toISOString(),
        totalTestCases: testCases.length,
      });
    } catch (err) {
      return sendJson(res, apiErrorStatus(err), { error: err.message });
    }
  }

  return sendJson(res, 404, { error: 'Not found', availableEndpoints: ['/', '/work-item', '/generate-test-cases'] });
});

server.listen(port, () => {
  console.log(`Azure Boards MCP server running on http://localhost:${port}`);
  console.log('Endpoints:');
  console.log(`  GET /work-item?url=<Azure Boards URL>`);
  console.log(`  GET /generate-test-cases?url=<Azure Boards URL>`);
});
