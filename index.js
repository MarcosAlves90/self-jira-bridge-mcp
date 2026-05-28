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

function formatError(err) {
  if (err.response) {
    return `HTTP ${err.response.status}: ${JSON.stringify(err.response.data, null, 2)}`;
  }
  return err.message;
}

async function safeCall(fn) {
  try {
    const data = await fn();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${formatError(err)}` }], isError: true };
  }
}

const server = new McpServer({ name: "jira-bridge", version: "2.0.0" });

server.registerTool(
  "request_jira",
  {
    description: "Send an authenticated request to Jira Cloud REST APIs as an escape hatch for unsupported endpoints",
    inputSchema: {
      base: z.enum(["api", "agile"]).optional().default("api"),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).describe("HTTP method"),
      path: z.string().describe("REST path starting with /, relative to the selected Jira base URL"),
      query: z.record(z.any()).optional().describe("Query parameters"),
      body: z.any().optional().describe("Request body"),
      headers: z.record(z.string()).optional().describe("Extra headers"),
    },
  },
  ({ base, method, path, query, body, headers }) =>
    safeCall(() => jira.requestJira({ base, method, path, query, body, headers }))
);

server.registerTool(
  "get_issue",
  {
    description: "Fetch a Jira issue with selectable fields and raw metadata",
    inputSchema: {
      key: z.string().describe("Jira issue key, e.g. PROJ-123"),
      fields: z.union([z.string(), z.array(z.string())]).optional().describe("Fields to fetch, defaults to *all"),
      expand: z.union([z.string(), z.array(z.string())]).optional().describe("Expand values such as changelog, renderedFields"),
      properties: z.union([z.string(), z.array(z.string())]).optional().describe("Issue properties to fetch"),
    },
  },
  ({ key, ...options }) => safeCall(() => jira.getIssue(key, options))
);

server.registerTool(
  "search_issues",
  {
    description: "Search Jira issues using JQL with selectable fields and raw response access",
    inputSchema: {
      jql: z.string().describe("JQL query string, e.g. project = PROJ AND status = 'In Progress'"),
      fields: z.union([z.string(), z.array(z.string())]).optional().describe("Fields to return; defaults to summary,status,assignee"),
      expand: z.union([z.string(), z.array(z.string())]).optional().describe("Expand values such as renderedFields"),
      startAt: z.number().int().nonnegative().optional().describe("Starting result index"),
      maxResults: z.number().int().positive().optional().describe("Maximum number of issues to return"),
      fieldsByKeys: z.boolean().optional().describe("Return custom fields by key instead of id"),
      properties: z.union([z.string(), z.array(z.string())]).optional().describe("Issue properties to include"),
    },
  },
  ({ jql, ...options }) => safeCall(() => jira.searchIssues(jql, options))
);

server.registerTool(
  "get_issue_metadata",
  {
    description: "Inspect field metadata, createmeta, editmeta, and transitions for an issue or project/issue type pair",
    inputSchema: {
      key: z.string().optional().describe("Issue key to derive project and issue type from"),
      project_key: z.string().optional().describe("Project key for createmeta lookup"),
      issue_type: z.string().optional().describe("Issue type name for createmeta lookup"),
    },
  },
  ({ key, project_key, issue_type }) =>
    safeCall(() =>
      jira.getIssueMetadata({ key, projectKey: project_key, issueType: issue_type })
    )
);

server.registerTool(
  "create_issue",
  {
    description: "Create a Jira issue with arbitrary fields and update payloads",
    inputSchema: {
      project_key: z.string().describe("Jira project key, e.g. PROJ"),
      issue_type: z.string().optional().default("Task").describe("Issue type name, defaults to Task"),
      summary: z.string().optional().describe("Issue summary/title"),
      description: z.string().optional().describe("Issue description in plain text"),
      assignee: z.union([z.string(), z.record(z.any())]).optional().describe("Assignee accountId or raw assignee object"),
      priority: z.union([z.string(), z.record(z.any())]).optional().describe("Priority name or raw priority object"),
      parent: z.union([z.string(), z.record(z.any())]).optional().describe("Parent issue key or raw parent object"),
      fields: z.record(z.any()).optional().describe("Additional Jira fields keyed by field id or name"),
      update: z.record(z.any()).optional().describe("Additional Jira update operations"),
    },
  },
  ({ project_key, issue_type, ...options }) =>
    safeCall(() =>
      jira.createIssue({
        projectKey: project_key,
        issueType: issue_type,
        ...options,
      })
    )
);

server.registerTool(
  "update_issue",
  {
    description: "Update arbitrary fields or transition an issue",
    inputSchema: {
      key: z.string().describe("Jira issue key"),
      summary: z.string().optional().describe("New summary"),
      description: z.string().optional().describe("New description in plain text"),
      assignee: z.union([z.string(), z.record(z.any())]).optional().describe("Assignee accountId or raw assignee object"),
      priority: z.union([z.string(), z.record(z.any())]).optional().describe("Priority name or raw priority object"),
      parent: z.union([z.string(), z.record(z.any())]).optional().describe("Parent issue key or raw parent object"),
      status: z.string().optional().describe("Target transition name, e.g. In Progress"),
      transition_id: z.string().optional().describe("Target transition id"),
      transition_name: z.string().optional().describe("Alias for status when you want to be explicit"),
      fields: z.record(z.any()).optional().describe("Additional Jira fields keyed by field id or name"),
      update: z.record(z.any()).optional().describe("Additional Jira update operations"),
    },
  },
  ({ key, ...fields }) => safeCall(() => jira.updateIssue(key, fields))
);

server.registerTool(
  "transition_issue",
  {
    description: "Transition an issue explicitly, optionally setting fields in the same request",
    inputSchema: {
      key: z.string().describe("Jira issue key"),
      transition: z.union([z.string(), z.object({ id: z.union([z.string(), z.number()]).optional(), name: z.string().optional() })]).describe("Transition name or id"),
      fields: z.record(z.any()).optional().describe("Additional Jira fields to send with the transition"),
      update: z.record(z.any()).optional().describe("Additional Jira update operations to send with the transition"),
    },
  },
  ({ key, transition, ...options }) => safeCall(() => jira.transitionIssue(key, { transition, ...options }))
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
  "add_attachment",
  {
    description: "Upload an attachment to an existing issue",
    inputSchema: {
      key: z.string().describe("Jira issue key"),
      path: z.string().optional().describe("Local file path to upload"),
      content: z.string().optional().describe("Attachment content when uploading inline text or base64 data"),
      filename: z.string().optional().describe("Attachment filename, required when content is provided directly"),
      content_encoding: z.enum(["utf8", "base64"]).optional().default("utf8").describe("How to interpret inline content"),
      content_type: z.string().optional().describe("Optional MIME type, defaults to application/octet-stream"),
    },
  },
  ({ key, content_encoding, content_type, ...options }) =>
    safeCall(() =>
      jira.addAttachment(key, {
        ...options,
        contentEncoding: content_encoding,
        contentType: content_type,
      })
    )
);

server.registerTool(
  "get_attachment",
  {
    description: "Fetch attachment metadata by attachment id",
    inputSchema: {
      id: z.union([z.string(), z.number()]).describe("Jira attachment id"),
    },
  },
  ({ id }) => safeCall(() => jira.getAttachment(id))
);

server.registerTool(
  "delete_attachment",
  {
    description: "Delete an attachment by attachment id",
    inputSchema: {
      id: z.union([z.string(), z.number()]).describe("Jira attachment id"),
    },
  },
  ({ id }) => safeCall(() => jira.deleteAttachment(id))
);

server.registerTool(
  "list_projects",
  {
    description: "List all Jira projects accessible with the current credentials",
    inputSchema: z.object({}),
  },
  () => safeCall(() => jira.listProjects())
);

server.registerTool(
  "get_sprint",
  {
    description: "Get sprint info and its issues for a given board ID",
    inputSchema: {
      board_id: z.string().describe("Jira board ID"),
      state: z.enum(["active", "future", "closed"]).optional().default("active").describe("Sprint state filter"),
    },
  },
  ({ board_id, state }) => safeCall(() => jira.getSprint(board_id, state))
);

const transport = new StdioServerTransport();
await server.connect(transport);
