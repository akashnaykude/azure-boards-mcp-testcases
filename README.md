# Azure Boards MCP Testcases

Fetch any Azure Boards work item by URL and generate QA test cases automatically — no manual copy-paste required.

## How it works

1. You provide only an Azure Boards work item URL, e.g.:
   `https://dev.azure.com/worldpanelbynumerator/KT-DataCollection/_workitems/edit/209974`
2. The server extracts the work item ID, fetches the ticket from Azure DevOps (title, description, acceptance criteria, state, tags, type, assignee, comments).
3. It returns a structured payload of QA test cases ready for review.

## Setup

### 1. Clone and install
```bash
git clone https://github.com/akashnaykude/azure-boards-mcp-testcases.git
cd azure-boards-mcp-testcases
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```
Edit `.env` and set your Azure DevOps Personal Access Token:
```
AZDO_ORG=worldpanelbynumerator
AZDO_PROJECT=KT-DataCollection
AZDO_PAT=<your-personal-access-token>
PORT=3000
```

> **How to create a PAT:** Go to `https://dev.azure.com/<org>` → User Settings → Personal Access Tokens → New Token → grant **Work Items (Read)** scope.

### 3. Start the server
```bash
npm start
```

## Usage

### Fetch work item details
```bash
curl "http://localhost:3000/work-item?url=https://dev.azure.com/worldpanelbynumerator/KT-DataCollection/_workitems/edit/209974"
```

### Generate QA test cases
```bash
curl "http://localhost:3000/generate-test-cases?url=https://dev.azure.com/worldpanelbynumerator/KT-DataCollection/_workitems/edit/209974"
```

You can also use a plain work item ID instead of the full URL:
```bash
curl "http://localhost:3000/generate-test-cases?id=209974"
```

### Sample response (`/generate-test-cases`)
```json
{
  "workItem": {
    "id": "209974",
    "type": "User Story",
    "title": "My feature title",
    "state": "Active",
    "assignedTo": "Developer Name",
    "tags": "sprint-11; regression",
    "url": "https://dev.azure.com/worldpanelbynumerator/KT-DataCollection/_workitems/edit/209974"
  },
  "testCases": [
    {
      "id": "TC-001",
      "type": "Positive",
      "title": "Verify: <acceptance criteria line>",
      "preconditions": "Work item 209974 is accessible and user is logged in",
      "steps": "1. Navigate to the feature\n2. ...",
      "expectedResult": "Feature behaves as described in acceptance criteria",
      "priority": "2"
    },
    {
      "id": "TC-002",
      "type": "Negative",
      "title": "Verify error handling for invalid input on: My feature title",
      ...
    }
  ],
  "generatedAt": "2026-08-20T10:00:00.000Z",
  "totalTestCases": 5
}
```

## Available endpoints

| Endpoint | Description |
|---|---|
| `GET /` | Server info and endpoint list |
| `GET /work-item?url=<URL>` | Fetch raw structured work item from Azure DevOps |
| `GET /generate-test-cases?url=<URL>` | Fetch work item and generate QA test cases |

Both endpoints accept either `?url=<full Azure Boards URL>` or `?id=<numeric work item ID>`.

## Environment variables

| Variable | Description |
|---|---|
| `AZDO_ORG` | Azure DevOps organization name |
| `AZDO_PROJECT` | Azure DevOps project name |
| `AZDO_PAT` | Personal Access Token (Work Items: Read scope) |
| `PORT` | HTTP port (default: 3000) |

## Files

| File | Purpose |
|---|---|
| `mcp-server/index.js` | Main server — URL parsing, Azure DevOps fetch, test case generation |
| `.env.example` | Environment variable template |
| `.github/copilot-instructions.md` | Copilot workflow instructions |
| `package.json` | Project metadata and scripts |

