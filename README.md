# mcp-jira-bridge

![Node.js](https://img.shields.io/badge/Node.js-ESM-339933?logo=nodedotjs&logoColor=white)
![Jira](https://img.shields.io/badge/Jira-Cloud-0052CC?logo=jira&logoColor=white)
![MCP SDK](https://img.shields.io/badge/MCP_SDK-1.29-6B46C1?logo=anthropic&logoColor=white)
![Tools](https://img.shields.io/badge/tools-7-orange)
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
| `get_issue` | Fetch full details of an issue by key (e.g. `PROJ-123`) |
| `search_issues` | Search issues using JQL |
| `create_issue` | Create a new Task in the configured project |
| `update_issue` | Update fields or transition the status of an issue |
| `add_comment` | Add a plain-text comment to an issue |
| `list_projects` | List all accessible Jira projects |
| `get_sprint` | Get sprint info and its issues for a board |
