# Azure Boards MCP Testcases

Minimal setup for using GitHub Copilot + MCP to fetch Azure Boards work items and generate QA test cases.

## What is configured
- MCP server tool: `get_work_item`
- Input accepted by the tool: Azure Boards ticket ID **or** work item URL
- Output fields: title, description, acceptance criteria, state, tags, work item type, assigned user, comments
- Copilot instructions in `.github/copilot-instructions.md` for generating test cases from fetched ticket context

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. In VS Code/Copilot Chat, the workspace MCP config is in `.vscode/mcp.json`.
3. Start Copilot Chat and connect the `azure-boards` MCP server (it will prompt for):
   - `AZDO_ORG`
   - `AZDO_PROJECT`
   - `AZDO_PAT`

## Usage in Copilot Chat
Use a prompt like:

```text
Fetch work item from this ticket and generate QA test cases:
https://dev.azure.com/<org>/<project>/_workitems/edit/209974
```

or:

```text
Generate QA test cases for Azure Boards ticket 209974.
```
