# GitHub Copilot Instructions

When a user provides an Azure Boards ticket ID or URL, use the MCP tool `get_azure_board_work_item` first.

Required workflow:
1. Call `get_azure_board_work_item` with the user-provided ticket URL or numeric ID.
2. Read the returned fields: title, description, acceptance criteria, state, tags, work item type, assignee, and comments (if present).
3. Generate QA test cases only from the fetched ticket context.
4. Include positive, negative, edge, regression, and accessibility coverage when relevant.
5. Return results as a clear table.

If any ticket field is missing, mention the assumption and continue with best-effort test cases.
