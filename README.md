# mcp-jira-bridge

![Node.js](https://img.shields.io/badge/Node.js-ESM-339933?logo=nodedotjs&logoColor=white)
![Jira](https://img.shields.io/badge/Jira-Cloud-0052CC?logo=jira&logoColor=white)
![MCP SDK](https://img.shields.io/badge/MCP_SDK-1.29-6B46C1?logo=anthropic&logoColor=white)
![Tools](https://img.shields.io/badge/tools-13-orange)
![Maintained](https://img.shields.io/badge/maintained-yes-brightgreen)

MCP server that exposes Jira Cloud operations to AI agents.

## Table of Contents

- [Setup](#setup)
- [MCP Client Config](#mcp-client-config)
- [Tools](#tools)

## Setup

```bash
npm install
cp .env.example .env
# fill in .env
```

**.env**
```
JIRA_BASE_URL=https://your-org.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_TOKEN=your-api-token
JIRA_PROJECT=PROJ
```

Generate an API token at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens).

## MCP Client Config

```json
{
  "mcpServers": {
    "jira-bridge": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-jira-bridge/index.js"]
    }
  }
}
```

## Tools

| Tool | Description |
|---|---|
| `request_jira` | Send an authenticated request to Jira REST as an escape hatch for unsupported endpoints |
| `get_issue` | Fetch an issue with selectable fields and raw metadata |
| `search_issues` | Search issues using JQL with selectable fields and raw response access |
| `get_issue_metadata` | Inspect field catalog, createmeta, editmeta, and transitions |
| `create_issue` | Create an issue with arbitrary fields and update payloads |
| `update_issue` | Update arbitrary fields or transition an issue |
| `transition_issue` | Transition an issue explicitly, optionally sending fields in the same request |
| `add_comment` | Add a plain-text comment to an issue |
| `add_attachment` | Upload an attachment to an existing issue |
| `get_attachment` | Fetch attachment metadata by attachment id |
| `delete_attachment` | Delete an attachment by attachment id |
| `list_projects` | List all accessible Jira projects |
| `get_sprint` | Get sprint info and its issues for a board |

## Notes

- `get_issue` returns both a normalized `issue` object and the raw Jira payload under `raw`.
- `search_issues` accepts optional `fields`, `expand`, `fieldsByKeys`, `startAt`, and `maxResults`.
- `create_issue` and `update_issue` accept free-form Jira `fields` and `update` payloads so custom fields are no longer blocked by the bridge.
- `add_attachment` uploads a multipart `file` field and sets `X-Atlassian-Token: no-check`, which Jira Cloud requires for multipart requests.
- `add_attachment` accepts either a local `path` or inline `content` plus `filename`; inline content can be plain text or base64 via `content_encoding`.
- `get_attachment` returns normalized attachment metadata and the raw Jira payload under `raw`.
- `delete_attachment` deletes an attachment by id and returns the deleted id.
- `get_issue_metadata` is the discovery tool for required, editable, and transition-specific fields.
- `request_jira` is the escape hatch for Jira REST endpoints that do not yet have a dedicated helper.
