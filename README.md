# Azure Boards MCP Testcases

This repository provides a minimal MCP server so GitHub Copilot can read Azure Boards work items from a ticket URL or ID and generate QA test cases from the ticket content.

## What is implemented
- MCP server at `/mcp-server/index.js`
- Tool: `get_azure_boards_work_item`
- Ticket parsing support for:
  - Numeric IDs (example: `209974`)
  - Full Azure Boards URLs (example: `https://dev.azure.com/<your-org>/<your-project>/_workitems/edit/209974`)
- Azure DevOps REST API fetch via environment variables
- Returned fields for QA generation:
  - title
  - description
  - acceptance criteria
  - state
  - tags
  - work item type
  - assignee (if available)
  - comments (if API access allows)

## Prerequisites
- Node.js 20+
- Azure DevOps PAT with **Work Items (Read)** scope

## Environment setup
1. Copy `.env.example` to `.env`.
2. Set:
   - `AZDO_ORG`
   - `AZDO_PROJECT`
   - `AZDO_PAT`

## Install and run
```bash
npm install
npm start
```

The server runs over stdio as an MCP server (for Copilot MCP connection).

## Connect Copilot to this MCP server
Configure your Copilot MCP settings to start this server from the repository root:

```json
{
  "servers": {
    "azure-boards": {
      "command": "node",
      "args": ["mcp-server/index.js"],
      "env": {
        "AZDO_ORG": "<your-org>",
        "AZDO_PROJECT": "<your-project>",
        "AZDO_PAT": "<your-pat>"
      }
    }
  }
}
```

## Copilot workflow
1. Connect Copilot to the `azure-boards` MCP server.
2. In Copilot Chat, paste an Azure Boards URL or ID.
3. Copilot calls `get_azure_boards_work_item` to fetch the work item.
4. Copilot generates QA test cases from fetched fields.

Example prompt:

```text
Read this Azure Boards ticket and generate QA test cases from title, description, acceptance criteria, comments, state, tags, work item type, and assignee:
https://dev.azure.com/<your-org>/<your-project>/_workitems/edit/209974
```

## Validation and error handling
The MCP tool returns clear errors for:
- invalid Azure Boards URL format
- missing work item ID input
- missing required environment variables
- Azure DevOps API failures
