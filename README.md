# Azure Boards MCP Testcases

Connect GitHub Copilot to Azure Boards via a minimal MCP server so ticket details can be fetched by URL and transformed into QA test cases.

## What this repo does
- Accepts an Azure Boards ticket URL **or** numeric ID
- Fetches work item fields (title, description, acceptance criteria, state, tags, type) from Azure Boards REST API
- Passes the data to Copilot for QA test case generation
- Keeps Azure DevOps credentials outside the repo using environment variables

## Files
| File | Purpose |
|------|---------|
| `package.json` | Project metadata and scripts |
| `.gitignore` | Ignores local and secret files |
| `.env.example` | Azure Boards environment variable template |
| `.github/copilot-instructions.md` | Copilot workflow instructions |
| `mcp-server/index.js` | Azure Boards MCP server |

## Environment variables
Copy `.env.example` to `.env` and fill in your Azure DevOps values:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `AZDO_ORG` | Your Azure DevOps organization name |
| `AZDO_PROJECT` | Your Azure DevOps project name |
| `AZDO_PAT` | Personal Access Token with **Work Items (Read)** scope |
| `PORT` | Server port (default: `3000`) |

> **Never commit your `.env` file.** It is already listed in `.gitignore`.

## How to run

```bash
npm install
npm start
```

## URL-based ticket → test case workflow

### 1. Paste a ticket URL into Copilot Chat
```
Read the Azure Boards ticket from this URL and generate QA test cases:
https://dev.azure.com/{org}/{project}/_workitems/edit/{id}
```

### 2. The MCP server fetches the work item
Copilot calls the server endpoint automatically:
```
GET http://localhost:3000/work-item?url=https://dev.azure.com/{org}/{project}/_workitems/edit/{id}
```
or by ID:
```
GET http://localhost:3000/work-item?id=209974
```

### 3. Copilot generates test cases
Using the returned `title`, `description`, `acceptanceCriteria`, `state`, `tags`, and `type`, Copilot generates a table of QA test cases covering positive, negative, edge, regression, and accessibility scenarios.

## Health check

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

## Error reference

| Status | Meaning |
|--------|---------|
| `400` | Missing or invalid work item ID / URL |
| `401` | `AZDO_PAT` is incorrect or expired |
| `404` | Work item not found |
| `503` | One or more required environment variables are missing |

