# Copilot Instructions

Use this repository for Azure Boards URL-driven QA test case generation.

## Workflow
1. When a user provides an Azure Boards work item URL (e.g. `https://dev.azure.com/worldpanelbynumerator/KT-DataCollection/_workitems/edit/209974`) or a plain numeric ID, fetch the work item automatically via the MCP server — do NOT ask the user to paste ticket content.
2. Call `GET http://localhost:3000/generate-test-cases?url=<URL>` to get the work item and test cases together.
3. Read the fetched title, description, acceptance criteria, state, tags, type, assignee, and comments.
4. Generate test cases that cover:
   - positive scenarios
   - negative scenarios
   - edge cases
   - regression risk
   - UI/UX checks if relevant
   - accessibility checks if relevant
5. Return the test cases in a clear table.

## Prompt style
Always ask the model to:
- stay within the scope of the ticket
- identify affected functionality
- include regression coverage even for cosmetic changes
- mention assumptions when ticket details are incomplete

## Expected output format
- Test Case ID
- Type
- Title / Scenario
- Preconditions
- Steps
- Expected Result
- Priority

