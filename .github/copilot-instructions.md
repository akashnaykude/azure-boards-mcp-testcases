# GitHub Copilot Instructions

When a user provides an Azure Boards work item URL or ID, use the MCP server endpoint to fetch the work item automatically — do NOT ask the user to paste ticket details manually.

## Required workflow

1. Accept only the Azure Boards work item URL, e.g.:
   `https://dev.azure.com/worldpanelbynumerator/KT-DataCollection/_workitems/edit/209974`
   OR a plain numeric work item ID, e.g. `209974`.

2. Call the local MCP server to fetch the work item:
   - `GET http://localhost:3000/work-item?url=<URL>` — returns structured ticket data
   - `GET http://localhost:3000/generate-test-cases?url=<URL>` — returns test cases directly

3. Read the fetched content: title, description, acceptance criteria, state, tags, work item type, assignee, and comments.

4. Generate QA test cases only from the fetched ticket context.

5. Include coverage for: positive, negative, edge, regression, and accessibility scenarios when relevant.

6. Return results as a clear table with columns: Test Case ID, Type, Title, Preconditions, Steps, Expected Result, Priority.

## Notes

- Never ask the user to copy-paste ticket content.
- If the server is not running, instruct the user to run `npm start` first.
- If credentials are missing, instruct the user to copy `.env.example` to `.env` and set `AZDO_PAT`.
- If any ticket field is missing, note the assumption and continue with best-effort test cases.

