# Copilot Instructions

Use this repository as the starter for Azure Boards ticket-driven QA generation.

## Workflow
1. When a user provides a ticket ID, first fetch the Azure Boards work item through the MCP server.
2. Read the title, description, and acceptance criteria.
3. Generate test cases that cover:
   - positive scenarios
   - negative scenarios
   - edge cases
   - regression risk
   - UI/UX checks if relevant
   - accessibility checks if relevant
4. Return the test cases in a clear table.

## Prompt style
Always ask the model to:
- stay within the scope of the ticket
- identify affected functionality
- include regression coverage even for cosmetic changes
- mention assumptions when ticket details are incomplete

## Expected output format
- Test Case ID
- Scenario
- Preconditions
- Steps
- Expected Result
- Priority
- Type
