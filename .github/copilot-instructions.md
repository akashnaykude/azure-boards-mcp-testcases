# GitHub Copilot Instructions

When a user provides an Azure Boards ticket ID **or URL**, use the MCP/server endpoint to fetch the work item first.

## Accepted input formats
- Numeric ticket ID: `209974`
- Full Azure Boards URL: `https://dev.azure.com/{org}/{project}/_workitems/edit/{id}`
- Visual Studio URL: `https://{org}.visualstudio.com/{project}/_workitems/edit/{id}`

## Required workflow
1. Extract the numeric work item ID from the input (ID or URL).
2. Call the MCP server: `GET http://localhost:3000/work-item?url=<url>` or `GET http://localhost:3000/work-item?id=<id>`.
3. Read the returned fields: `title`, `description`, `acceptanceCriteria`, `state`, `tags`, `type`.
4. Generate QA test cases only from the ticket context.
5. Include positive, negative, edge, regression, and accessibility coverage when relevant.
6. Return results as a clear table with columns: Test Case ID, Scenario, Preconditions, Steps, Expected Result, Priority, Type.

## Example prompt
> Read the Azure Boards ticket from this URL and generate concise QA test case titles:
> `https://dev.azure.com/{org}/{project}/_workitems/edit/{id}`

## Error handling
- If `AZDO_ORG`, `AZDO_PROJECT`, or `AZDO_PAT` are missing, the server returns `503`. Prompt the user to set the environment variables.
- If the ticket is not found, the server returns `404`. Ask the user to verify the ID or URL.
- If any ticket field is missing, mention the assumption and continue with best-effort test cases.
