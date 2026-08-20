# Azure Boards MCP Server

An MCP-style HTTP server that fetches Azure Boards work items and returns the fields needed for GitHub Copilot to generate QA test cases.

## Azure DevOps project

| Setting | Value |
|---------|-------|
| Organisation | `worldpanelbynumerator` |
| Project | `KT-DataCollection` |
| Example work item | [209974](https://dev.azure.com/worldpanelbynumerator/KT-DataCollection/_workitems/edit/209974) |

## What this server returns

For each work item the server returns:

- `id`, `type`, `state`, `title`
- `description`, `acceptanceCriteria`
- `tags`, `assignedTo`, `priority`
- `areaPath`, `iterationPath`
- `createdBy`, `createdDate`, `changedDate`
- `url` – direct link to the work item in Azure DevOps

## Setup

### 1 – Clone and install

```bash
git clone https://github.com/akashnaykude/azure-boards-mcp-testcases.git
cd azure-boards-mcp-testcases
npm install
```

### 2 – Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and set your Personal Access Token (PAT).  
The PAT needs **Work Items (Read)** scope.

```dotenv
AZDO_ORG=worldpanelbynumerator
AZDO_PROJECT=KT-DataCollection
AZDO_PAT=<your-pat-here>
PORT=3000
```

> **Never commit `.env` to source control.** It is already listed in `.gitignore`.

### 3 – Start the server

```bash
npm start
```

You should see:

```
Azure Boards MCP server running on port 3000
  org:     worldpanelbynumerator
  project: KT-DataCollection
  health:  http://localhost:3000/health
  example: http://localhost:3000/work-item?id=209974
```

## API endpoints

### `GET /health`

Returns server status and the configured org/project.

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "ok",
  "org": "worldpanelbynumerator",
  "project": "KT-DataCollection",
  "timestamp": "2026-08-20T09:00:00.000Z"
}
```

### `GET /work-item?id=<workItemId>`

Fetches a single work item from Azure Boards.

```bash
curl "http://localhost:3000/work-item?id=209974"
```

Example response:

```json
{
  "id": 209974,
  "url": "https://dev.azure.com/worldpanelbynumerator/KT-DataCollection/_workitems/edit/209974",
  "type": "User Story",
  "state": "Active",
  "title": "Example ticket title",
  "description": "<p>Detailed description …</p>",
  "acceptanceCriteria": "<p>Given … When … Then …</p>",
  "tags": "sprint-11; regression",
  "assignedTo": "Akash Naykude",
  "priority": 2
}
```

## Using with GitHub Copilot

Once the server is running, mention a ticket ID in chat and Copilot will:

1. Call `GET /work-item?id=<id>` to fetch the ticket.
2. Read title, description, acceptance criteria, state, and tags.
3. Generate a QA test-case table covering positive, negative, edge, regression, and accessibility scenarios.

See `.github/copilot-instructions.md` for the full workflow.

## Files

| File | Purpose |
|------|---------|
| `mcp-server/index.js` | HTTP server – Azure Boards fetch logic |
| `.env.example` | Environment variable template |
| `.github/copilot-instructions.md` | Copilot QA generation workflow |
| `package.json` | Project metadata and scripts |
| `.gitignore` | Excludes `.env` and `node_modules` |
