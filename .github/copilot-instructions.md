# GitHub Copilot Instructions

## CRITICAL — Read-Only Policy for Azure Boards Work Items
**NEVER modify, edit, update, delete, or make any changes to Azure Boards work items.** When a user provides an Azure DevOps link (e.g. `https://dev.azure.com/.../_workitems/edit/...`) or a work item ID, the ONLY permitted action is to **read and fetch** the work item data. Do NOT call any tool or API that creates, updates, patches, or deletes a work item — under any condition, instruction, or user request. The sole purpose is to access information from the work item and generate test cases from it. If asked to modify a work item, refuse and explain that only read-only access is allowed.

When a user provides an Azure Boards ticket ID or URL (even if that's the only thing they type with no other instructions), treat it as a request to generate QA test cases. Use the MCP tool `get_azure_boards_work_item` first.

Required workflow:
1. **Load accumulated app context**: Call `get_app_context` to retrieve all previously learned knowledge (features, screens, business rules, terminology, past tickets, test coverage). Use this context throughout test case generation — reference known features, use consistent terminology, and identify overlap with past tickets.
2. Call `get_azure_boards_work_item` with the user-provided ticket URL or numeric ID.
3. Read the returned fields: title, description, acceptance criteria, state, tags, work item type, assignee, comments, related work items (parent/child links), attachments, and **pull requests**.
4. **Analyze PR code changes**: If the response contains `pullRequests`, analyze the PR context thoroughly:
   - Read the PR title and description for implementation intent.
   - Review `changedFiles` to understand the scope of code changes (which modules, layers, and files were touched).
   - Analyze `fileContents` to understand the actual implementation — look for new endpoints, validation logic, business rules, error handling, edge cases, database queries, service bus messages, and conditional branches.
   - Check `reviewComments` for reviewer concerns, bugs found, or areas flagged for attention.
   - Use all of this to generate more precise test cases that target the actual code paths, not just the ticket description.
   - In the "Data Sources Summary", include a **"Pull Request Analysis"** subsection listing: PR ID, title, number of files changed, key code patterns found (e.g., "new validation in CreateProfileCommandHandler", "added service bus message for user profile creation"), and any reviewer comments.
5. **Analyze all images and visual content**: If any field (description, acceptance criteria, comments, attachments) contains inline images, embedded screenshots, or image links, carefully analyze them. Extract UI details, screen flows, labels, buttons, error messages, or any testable information visible in the images. Incorporate relevant findings into the test cases.
6. **Before generating test cases, provide a "Data Sources Summary" section** that lists:
   - All fields accessed from the work item (title, description, acceptance criteria, state, tags, assignee, comments, related work items).
   - All attachments and inline images found — for each, list the file name, file type, a brief summary of its content, and any UI elements/flows/labels visible in images that are relevant for testing.
   - Clearly state which specific data points from each source were used as the basis for test case generation.
   - If any field or attachment was empty/missing, explicitly mention it.
7. Generate QA test cases from the fetched ticket context — use related child work items and comments for additional scenario coverage.
8. Include positive, negative, edge, regression, and accessibility coverage when relevant.
9. **TestRail-Compatible Format**: Structure test cases internally with these exact columns (TestRail import format) for Excel export:
   - **Title**: Short descriptive test case name
   - **Preconditions**: Any setup/prerequisites needed before executing
   - **Steps**: Numbered step-by-step actions (use line breaks within the cell: Step 1\nStep 2\nStep 3)
   - **Expected Result**: What should happen after executing the steps
   - **Priority**: Critical / High / Medium / Low
   - **Type**: Functional / Negative / Edge Case / Regression / Accessibility / Visual / Integration
   - **Automation Status**: None (default for new test cases)
10. Using images available in the work item, description, and comments, generate visual test cases that validate UI elements, screen flows, and user interactions.
11. **Auto-Export to Excel**: Immediately call the MCP tool `export_test_cases_to_onedrive` with the test cases data. Pass the functionality title (from the work item title) and the structured test cases array. The tool will create an Excel file named `<functionality>_<dd_mm_yyyy>.xlsx` in the "Shoppix Test Cases" folder.
12. **DO NOT print the full test case table in chat.** Since test cases are exported to Excel, showing them again in chat is redundant. Instead, after export, show a **compact summary** in chat:
    - **Total test case count**
    - **Breakdown by Type** (e.g., Functional: 20, Negative: 3, Edge Case: 2, etc.)
    - **Breakdown by Priority** (e.g., Critical: 5, High: 12, Medium: 15, Low: 4)
    - **Key areas covered** — a short bullet list of the main functional areas/scenarios tested (e.g., "Token balance display", "Category filtering", "Offline handling")
    - **Excel file path** for quick access
13. **After the summary, provide an "Image-Based Test Case Mapping" section** that clearly lists which test cases were derived from each image/screenshot. For every image analyzed, list:
    - The image file name
    - A brief description of what the image shows
    - The specific test case titles that were created based on that image
    - What UI elements or flows from the image inspired each test case
14. **Save learned context**: Call `save_ticket_context` with all features, screens, business rules, terminology, and covered areas extracted from this ticket. This grows the knowledge base for future tickets. Extract:
    - **Features**: Every distinct feature or module mentioned (e.g., "token-balance", "barcode-scanner").
    - **Screens**: Every UI screen or page referenced (e.g., "home-screen", "receipt-upload").
    - **Business rules**: Validation logic, constraints, or conditional behavior discovered.
    - **Terminology**: Domain-specific terms and their meanings.
    - **Covered areas**: Feature slugs that the generated test cases cover.
15. **Cross-reference with past tickets**: If `get_app_context` returned past ticket history, mention in the summary any overlap or related past tickets (e.g., "Related to previously tested ticket #12345 — Token Balance Display"). Suggest regression tests for areas that might be affected.

If any ticket field is missing, mention the assumption and continue with best-effort test cases.

## Temporary Files Policy
All temporary files (extracted images, downloaded attachments, intermediate processing files) MUST be created inside the `temp/` folder at the project root — **NEVER** in the project root or any other directory. After the temporary file has been used (e.g., image analyzed, attachment parsed), **delete it immediately** using a terminal command. At the end of every test case generation workflow, run a cleanup to remove all files from `temp/` (but keep `temp/.gitkeep`). The `temp/` folder is git-ignored so nothing in it will be committed.
