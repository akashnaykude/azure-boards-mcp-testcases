# GitHub Copilot Instructions

When a user provides an Azure Boards ticket ID, use the local MCP server endpoint to fetch the work item first.

## Azure DevOps project
- **Org:** worldpanelbynumerator
- **Project:** KT-DataCollection
- **Server:** http://localhost:3000

## Required workflow

1. Fetch the work item:
   ```
   GET http://localhost:3000/work-item?id=<ticketId>
   ```
2. Read the following fields from the response:
   - `title`
   - `description`
   - `acceptanceCriteria`
   - `state`
   - `tags`
   - `type` (work item type)
   - `assignedTo`
   - `priority`
3. Generate QA test cases **only** from the ticket context.
4. Include positive, negative, edge, regression, and accessibility coverage when relevant.
5. Return results as a clear table with columns: **Test Case ID**, **Scenario**, **Steps**, **Expected Result**, **Type**.

If any ticket field is missing or null, mention the assumption and continue with best-effort test cases.

## Example
User says: "Generate test cases for ticket 209974"

→ Fetch `http://localhost:3000/work-item?id=209974`
→ Use the returned fields to generate the test-case table.
