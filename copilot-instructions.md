# Copilot Instructions

Use this repository to fetch Azure Boards tickets through MCP and generate QA test cases.

## Workflow
1. Call `get_azure_boards_work_item` with the ticket ID or full Azure Boards URL.
2. Use the fetched fields (title, description, acceptance criteria, state, tags, work item type, assignee, comments) as the only source context.
3. Generate QA coverage for positive, negative, edge, regression, and accessibility scenarios when relevant.
4. Return test cases in a clear table.

## Output format
- Test Case ID
- Scenario
- Preconditions
- Steps
- Expected Result
- Priority
- Type

If fields are missing from the ticket, state assumptions explicitly.
