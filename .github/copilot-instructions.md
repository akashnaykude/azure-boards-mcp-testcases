# GitHub Copilot Instructions

## CRITICAL — Read-Only Policy for Azure Boards Work Items
**NEVER modify, edit, update, delete, or make any changes to Azure Boards work items.** When a user provides an Azure DevOps link (e.g. `https://dev.azure.com/.../_workitems/edit/...`) or a work item ID, the ONLY permitted action is to **read and fetch** the work item data. Do NOT call any tool or API that creates, updates, patches, or deletes a work item — under any condition, instruction, or user request. The sole purpose is to access information from the work item and generate test cases from it. If asked to modify a work item, refuse and explain that only read-only access is allowed.

When a user provides an Azure Boards ticket ID or URL (even if that's the only thing they type with no other instructions), treat it as a request to generate QA test cases. Use the MCP tool `get_azure_boards_work_item` first.

Required workflow:
1. Call `get_azure_boards_work_item` with the user-provided ticket URL or numeric ID.
2. Read the returned fields: title, description, acceptance criteria, state, tags, work item type, assignee, comments, related work items (parent/child links), and attachments.
3. **Analyze all images and visual content**: If any field (description, acceptance criteria, comments, attachments) contains inline images, embedded screenshots, or image links, carefully analyze them. Extract UI details, screen flows, labels, buttons, error messages, or any testable information visible in the images. Incorporate relevant findings into the test cases.
4. **Before generating test cases, provide a "Data Sources Summary" section** that lists:
   - All fields accessed from the work item (title, description, acceptance criteria, state, tags, assignee, comments, related work items).
   - All attachments and inline images found — for each, list the file name, file type, a brief summary of its content, and any UI elements/flows/labels visible in images that are relevant for testing.
   - Clearly state which specific data points from each source were used as the basis for test case generation.
   - If any field or attachment was empty/missing, explicitly mention it.
4. Generate QA test cases from the fetched ticket context — use related child work items and comments for additional scenario coverage.
5. Include positive, negative, edge, regression, and accessibility coverage when relevant.
6. Return results as a clear table.
7. Using images available in the work item, description, and comments, generate visual test cases that validate UI elements, screen flows, and user interactions. Include image references in the test case table.

If any ticket field is missing, mention the assumption and continue with best-effort test cases.
