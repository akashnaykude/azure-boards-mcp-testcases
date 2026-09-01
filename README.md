# Azure Boards MCP Testcases

MCP server that lets GitHub Copilot generate QA test cases from Azure Boards tickets. Just paste a ticket URL in Copilot Chat.

## Make sure Agent option is selected

## Setup

1. `npm install`
2. Configure `.vscode/mcp.json` with your `AZDO_ORG`, `AZDO_PROJECT`, and `AZDO_PAT` (needs **Work Items Read** scope).

### OneDrive Auto-Export Setup

To enable automatic export of test cases to OneDrive, add these env vars to your `.vscode/mcp.json`:

| Variable | Description |
|----------|-------------|
| `GRAPH_TENANT_ID` | Azure AD tenant ID |
| `GRAPH_CLIENT_ID` | App registration client ID |
| `GRAPH_CLIENT_SECRET` | App registration client secret |
| `GRAPH_USER_EMAIL` | OneDrive user email (e.g. `akash.naykude@wp.numerator.com`) |

**Azure AD App Registration:**
1. Go to [Azure Portal](https://portal.azure.com) → Azure Active Directory → App registrations → New registration.
2. Add API permission: **Microsoft Graph → Application permissions → Files.ReadWrite.All**.
3. Grant admin consent for the permission.
4. Create a client secret under Certificates & secrets.
5. Copy the Tenant ID, Client ID, and Client Secret into your MCP config.

Test cases are exported to the **"Shoppix Test Cases"** folder in OneDrive as `<functionality>_<dd_mm_yyyy>.xlsx`.

## How it works

1. Open this project in VS Code. The MCP server starts automatically.
2. Open Copilot Chat and paste an Azure Boards ticket URL, e.g.:
   ```
   https://dev.azure.com/yourorg/yourproject/_workitems/edit/209974
   ```
3. Copilot automatically reads the ticket (title, description, acceptance criteria, comments, related work items, attachments) and generates QA test cases.


## Restart MCP Server
Ctrl+Shift+P → type MCP: List Servers
Select azure-boards
Click Restart