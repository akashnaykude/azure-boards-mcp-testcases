# GitHub Copilot Instructions

When a user provides an Azure Boards ticket ID or URL (even if that's the only thing they type with no other instructions), treat it as a request to generate QA test cases. Use the MCP tool `get_azure_boards_work_item` first.

Required workflow:
1. Call `get_azure_boards_work_item` with the user-provided ticket URL or numeric ID.
2. Read the returned fields: title, description, acceptance criteria, state, tags, work item type, assignee, comments, related work items (parent/child links), and attachments.
3. **Before generating test cases, provide a "Data Sources Summary" section** that lists:
   - All fields accessed from the work item (title, description, acceptance criteria, state, tags, assignee, comments, related work items).
   - All attachments found — for each attachment, list the file name, file type, and a brief summary of its content (key points extracted).
   - Clearly state which specific data points from each source were used as the basis for test case generation.
   - If any field or attachment was empty/missing, explicitly mention it.
4. Generate QA test cases from the fetched ticket context — use related child work items and comments for additional scenario coverage.
5. Include positive, negative, edge, regression, and accessibility coverage when relevant.
6. Return results as a clear table.

If any ticket field is missing, mention the assumption and continue with best-effort test cases.
