# Azure Boards MCP Testcases

Starter repository for wiring GitHub Copilot to Azure Boards via an MCP server so ticket details can be fetched and transformed into QA test cases.

## What this repo does
- Read Azure Boards work items by ticket ID
- Pass title, description, acceptance criteria, state, tags, and work item type to Copilot
- Generate QA test cases from the ticket context
- Keep Azure DevOps credentials outside the repo using environment variables

## Files in this starter
- `package.json` - project metadata and scripts
- `.gitignore` - ignores local and secret files
- `.env.example` - Azure Boards environment variable template
- `.github/copilot-instructions.md` - Copilot workflow instructions
- `mcp-server/index.js` - starter Azure Boards fetch server

## Environment variables
Copy `.env.example` to `.env` and fill in your Azure DevOps values:
- `AZDO_ORG`
- `AZDO_PROJECT`
- `AZDO_PAT`
- `PORT`

## How to run
```bash
npm install
npm start
```

## Example request
```bash
curl "http://localhost:3000/work-item?id=123"
```

## Next step
Connect the server to your real Azure Boards tenant, then use the returned work item data to generate test cases.
