# Azure Boards MCP Testcases

MCP server that lets GitHub Copilot generate QA test cases from Azure Boards tickets. Just paste a ticket URL in Copilot Chat.

## Setup

1. `npm install`
2. Configure `.vscode/mcp.json` with your `AZDO_ORG`, `AZDO_PROJECT`, and `AZDO_PAT` (needs **Work Items Read** scope).

## How it works

1. Open this project in VS Code. The MCP server starts automatically.
2. Open Copilot Chat and paste an Azure Boards ticket URL, e.g.:
   ```
   https://dev.azure.com/yourorg/yourproject/_workitems/edit/209974
   ```
3. Copilot automatically reads the ticket (title, description, acceptance criteria, comments, related work items, attachments) and generates QA test cases.


