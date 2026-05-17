import dotenv from "dotenv";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as jira from "./jira.js";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const REQUIRED_ENV = ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_TOKEN"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

async function safeCall(fn) {
  try {
    const data = await fn();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    const message = err.response?.data
      ? JSON.stringify(err.response.data, null, 2)
      : err.message;
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
}

const server = new McpServer({ name: "jira-bridge", version: "1.0.0" });

server.registerTool(
  "get_issue",
  {
    description: "Fetch full details of a Jira issue by key (e.g. PROJ-123)",
    inputSchema: { key: z.string().describe("Jira issue key, e.g. PROJ-123") },
  },
  ({ key }) => safeCall(() => jira.getIssue(key))
);

server.registerTool(
  "search_issues",
  {
    description: "Search Jira issues using JQL. Returns key, summary, status, assignee",
    inputSchema: { jql: z.string().describe("JQL query string, e.g. project = PROJ AND status = 'In Progress'") },
  },
  ({ jql }) => safeCall(() => jira.searchIssues(jql))
);

server.registerTool(
  "create_issue",
  {
    description: "Create a new Task in a Jira project",
    inputSchema: {
      project_key: z.string().describe("Jira project key, e.g. PROJ"),
      summary: z.string().describe("Issue title"),
      description: z.string().describe("Issue description in plain text"),
    },
  },
  ({ project_key, summary, description }) => safeCall(() => jira.createIssue(project_key, summary, description))
);

server.registerTool(
  "update_issue",
  {
    description: "Update fields or transition the status of an issue. For status, provide the transition name (e.g. 'In Progress')",
    inputSchema: {
      key: z.string().describe("Jira issue key"),
      summary: z.string().optional().describe("New summary"),
      description: z.string().optional().describe("New description in plain text"),
      assignee: z.string().optional().describe("Assignee accountId"),
      priority: z.string().optional().describe("Priority name, e.g. High, Medium, Low"),
      status: z.string().optional().describe("Target status name, e.g. 'In Progress', 'Done'"),
    },
  },
  ({ key, ...fields }) => safeCall(() => jira.updateIssue(key, fields))
);

server.registerTool(
  "add_comment",
  {
    description: "Add a plain-text comment to an existing issue",
    inputSchema: {
      key: z.string().describe("Jira issue key"),
      body: z.string().describe("Comment text"),
    },
  },
  ({ key, body }) => safeCall(() => jira.addComment(key, body))
);

server.registerTool(
  "list_projects",
  {
    description: "List all Jira projects accessible with the current credentials",
    inputSchema: {},
  },
  () => safeCall(() => jira.listProjects())
);

server.registerTool(
  "get_sprint",
  {
    description: "Get sprint info and its issues for a given board ID",
    inputSchema: {
      board_id: z.string().describe("Jira board ID (use list_projects to find boards)"),
      state: z
        .enum(["active", "future", "closed"])
        .optional()
        .default("active")
        .describe("Sprint state filter, defaults to active"),
    },
  },
  ({ board_id, state }) => safeCall(() => jira.getSprint(board_id, state))
);

const transport = new StdioServerTransport();
await server.connect(transport);
