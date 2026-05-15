import axios from "axios";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_TOKEN } = process.env;

const auth = { username: JIRA_EMAIL, password: JIRA_TOKEN };
const headers = { Accept: "application/json", "Content-Type": "application/json" };

const api = axios.create({ baseURL: `${JIRA_BASE_URL}/rest/api/3`, auth, headers });
const agile = axios.create({ baseURL: `${JIRA_BASE_URL}/rest/agile/1.0`, auth, headers });

export async function getIssue(key) {
  const res = await api.get(`/issue/${key}`);
  return res.data;
}

export async function searchIssues(jql) {
  const res = await api.get(`/search`, { params: { jql } });
  return res.data;
}

function toADF(text) {
  return {
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text: text }] }],
  };
}

export async function createIssue(summary, description) {
  const res = await api.post(`/issue`, {
    fields: {
      project: { key: process.env.JIRA_PROJECT },
      summary,
      description: toADF(description),
      issuetype: { name: "Task" },
    },
  });
  return res.data;
}

export async function updateIssue(key, { summary, description, assignee, priority, status }) {
  if (status) {
    const { data } = await api.get(`/issue/${key}/transitions`);
    const transition = data.transitions.find(
      (t) => t.name.toLowerCase() === status.toLowerCase()
    );
    if (!transition) {
      throw new Error(
        `Status "${status}" not found. Available: ${data.transitions.map((t) => t.name).join(", ")}`
      );
    }
    await api.post(`/issue/${key}/transitions`, { transition: { id: transition.id } });
  }

  const fields = {};
  if (summary) fields.summary = summary;
  if (description) fields.description = toADF(description);
  if (assignee) fields.assignee = { accountId: assignee };
  if (priority) fields.priority = { name: priority };

  if (Object.keys(fields).length > 0) {
    await api.put(`/issue/${key}`, { fields });
  }

  return { updated: key };
}

export async function addComment(key, body) {
  const res = await api.post(`/issue/${key}/comment`, { body: toADF(body) });
  return res.data;
}

export async function listProjects() {
  const res = await api.get(`/project`);
  return res.data;
}

export async function getSprint(boardId, state = "active") {
  const res = await agile.get(`/board/${boardId}/sprint`, { params: { state } });
  const sprints = res.data.values;

  if (state === "active" && sprints.length > 0) {
    const sprint = sprints[0];
    const issues = await agile.get(`/board/${boardId}/sprint/${sprint.id}/issue`);
    return { sprint, issues: issues.data.issues };
  }

  return { sprints };
}
