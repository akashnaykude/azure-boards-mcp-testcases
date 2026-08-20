# GitHub Copilot Instructions

When a user provides an Azure Boards ticket ID or URL (even if that's the only thing they type with no other instructions), treat it as a request to generate QA test cases. Use the MCP tool `get_azure_boards_work_item` first.

Required workflow:
1. Call `get_azure_boards_work_item` with the user-provided ticket URL or numeric ID.
2. Read the returned fields: title, description, acceptance criteria, state, tags, work item type, assignee, comments, related work items (parent/child links), and attachments.
3. Generate QA test cases from the fetched ticket context — use related child work items and comments for additional scenario coverage.
4. Include positive, negative, edge, regression, and accessibility coverage when relevant.
5. Return results as a clear table.

If any ticket field is missing, mention the assumption and continue with best-effort test cases.
