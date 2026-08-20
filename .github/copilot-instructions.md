# GitHub Copilot Instructions

When a user provides an Azure Boards ticket ID or URL, use the MCP/server endpoint to fetch the work item first.

Required workflow:
1. Fetch the work item by ID.
2. Read title, description, acceptance criteria, state, tags, and work item type.
3. Generate QA test cases only from the ticket context.
4. Include positive, negative, edge, regression, and accessibility coverage when relevant.
5. Return results as a clear table.

If any ticket field is missing, mention the assumption and continue with best-effort test cases.
