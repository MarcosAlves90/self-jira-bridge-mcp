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

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null));
}

function normalizeSelection(value) {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.join(",");
  return String(value);
}

function normalizeFieldSelection(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return fallback;
}

function paragraphForText(text) {
  return {
    type: "paragraph",
    content: text ? [{ type: "text", text }] : [],
  };
}

export function toADF(text) {
  const source = String(text ?? "");
  const lines = source.split(/\r?\n/);
  return {
    type: "doc",
    version: 1,
    content: lines.map((line) => paragraphForText(line)),
  };
}

function extractNodeText(node) {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractNodeText).join("");
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (node.text) return node.text;
  if (Array.isArray(node.content)) return node.content.map(extractNodeText).join("");
  return "";
}

export function extractText(adf) {
  if (!adf) return null;
  if (Array.isArray(adf.content)) {
    return adf.content.map(extractNodeText).join("\n").trimEnd();
  }
  return extractNodeText(adf).trimEnd();
}

function normalizeUser(user) {
  if (!user) return null;
  return {
    accountId: user.accountId ?? null,
    displayName: user.displayName ?? null,
    emailAddress: user.emailAddress ?? null,
    active: user.active ?? null,
  };
}

function normalizeFieldObject(field) {
  if (!field) return null;
  return {
    id: field.id ?? null,
    key: field.key ?? null,
    name: field.name ?? null,
    value: field.value ?? null,
  };
}

export function normalizeIssue(raw) {
  const f = raw.fields ?? {};
  return {
    id: raw.id ?? null,
    key: raw.key,
    self: raw.self ?? null,
    summary: f.summary ?? null,
    description: extractText(f.description),
    status: f.status
      ? {
          id: f.status.id ?? null,
          name: f.status.name ?? null,
          statusCategory: f.status.statusCategory?.name ?? null,
        }
      : null,
    issuetype: f.issuetype
      ? {
          id: f.issuetype.id ?? null,
          name: f.issuetype.name ?? null,
          subtask: f.issuetype.subtask ?? null,
        }
      : null,
    project: f.project
      ? {
          id: f.project.id ?? null,
          key: f.project.key ?? null,
          name: f.project.name ?? null,
        }
      : null,
    assignee: normalizeUser(f.assignee),
    reporter: normalizeUser(f.reporter),
    creator: normalizeUser(f.creator),
    priority: f.priority?.name ?? null,
    resolution: f.resolution?.name ?? null,
    parent: f.parent
      ? {
          key: f.parent.key ?? null,
          summary: f.parent.fields?.summary ?? null,
        }
      : null,
    labels: f.labels ?? [],
    components: (f.components ?? []).map(normalizeFieldObject),
    fixVersions: (f.fixVersions ?? []).map(normalizeFieldObject),
    versions: (f.versions ?? []).map(normalizeFieldObject),
    subtasks: (f.subtasks ?? []).map((issue) => ({
      key: issue.key ?? null,
      summary: issue.fields?.summary ?? null,
      status: issue.fields?.status?.name ?? null,
    })),
    created: f.created ?? null,
    updated: f.updated ?? null,
    raw,
  };
}

export function normalizeIssueSummary(raw) {
  const f = raw.fields ?? {};
  return {
    id: raw.id ?? null,
    key: raw.key,
    summary: f.summary ?? null,
    status: f.status?.name ?? null,
    assignee: f.assignee?.displayName ?? null,
    priority: f.priority?.name ?? null,
    issuetype: f.issuetype?.name ?? null,
    project: f.project?.key ?? null,
    raw,
  };
}

function normalizeProject(raw) {
  return {
    key: raw.key,
    name: raw.name,
    type: raw.projectTypeKey,
    lead: raw.lead?.displayName ?? null,
  };
}

function normalizeComment(raw) {
  return {
    id: raw.id,
    author: raw.author?.displayName ?? null,
    body: extractText(raw.body),
    created: raw.created,
    updated: raw.updated,
    raw,
  };
}

function normalizeSprint(raw) {
  return { id: raw.id, name: raw.name, state: raw.state, goal: raw.goal ?? null, raw };
}

function buildIssueFields({
  summary,
  description,
  assignee,
  priority,
  projectKey,
  issueType,
  parent,
  fields,
}) {
  const payload = {
    ...(fields ?? {}),
  };

  if (projectKey !== undefined) {
    payload.project = { key: projectKey };
  }

  if (issueType !== undefined) {
    payload.issuetype = typeof issueType === "string" ? { name: issueType } : issueType;
  }

  if (summary !== undefined) {
    payload.summary = summary;
  }

  if (description !== undefined && payload.description === undefined) {
    payload.description = typeof description === "string" ? toADF(description) : description;
  }

  if (assignee !== undefined && payload.assignee === undefined) {
    payload.assignee = typeof assignee === "string" ? { accountId: assignee } : assignee;
  }

  if (priority !== undefined && payload.priority === undefined) {
    payload.priority = typeof priority === "string" ? { name: priority } : priority;
  }

  if (parent !== undefined && payload.parent === undefined) {
    payload.parent = typeof parent === "string" ? { key: parent } : parent;
  }

  return payload;
}

function buildWritePayload(input) {
  const fieldsPayload = buildIssueFields(input);
  const updatePayload = input.update ?? {};
  const body = {};

  if (Object.keys(fieldsPayload).length > 0) {
    body.fields = fieldsPayload;
  }

  if (Object.keys(updatePayload).length > 0) {
    body.update = updatePayload;
  }

  return body;
}

async function request(base, config) {
  const client = base === "agile" ? agile : api;
  const res = await client.request(config);
  return {
    status: res.status,
    headers: {
      "content-type": res.headers["content-type"] ?? null,
    },
    data: res.data,
  };
}

export async function requestJira({ base = "api", method, path, query, body, headers: extraHeaders }) {
  if (!path || !path.startsWith("/")) {
    throw new Error("Jira request path must start with '/'");
  }

  return request(base, {
    url: path,
    method: method.toUpperCase(),
    params: compactObject(query ?? {}),
    data: body,
    headers: extraHeaders ? { ...headers, ...extraHeaders } : headers,
  });
}

export async function getIssue(key, { fields, expand, properties } = {}) {
  const query = compactObject({
    fields: normalizeSelection(fields ?? "*all"),
    expand: normalizeSelection(expand),
    properties: normalizeSelection(properties),
  });
  const res = await request("api", { url: `/issue/${key}`, method: "GET", params: query });
  return {
    issue: normalizeIssue(res.data),
    raw: res.data,
  };
}

export async function searchIssues(jql, options = {}) {
  const body = compactObject({
    jql,
    startAt: options.startAt,
    maxResults: options.maxResults,
    fields: normalizeFieldSelection(options.fields, ["summary", "status", "assignee"]),
    expand: normalizeSelection(options.expand),
    fieldsByKeys: options.fieldsByKeys,
    properties: normalizeFieldSelection(options.properties),
  });
  const res = await request("api", { url: "/search/jql", method: "POST", data: body });
  return {
    issues: (res.data.issues ?? []).map(normalizeIssueSummary),
    total: res.data.total ?? null,
    isLast: res.data.isLast ?? null,
    startAt: res.data.startAt ?? null,
    maxResults: res.data.maxResults ?? null,
    raw: res.data,
  };
}

export async function getIssueMetadata({ key, projectKey, issueType } = {}) {
  let issue = null;
  let resolvedProjectKey = projectKey;
  let resolvedIssueType = issueType;

  if (key) {
    const issueRes = await getIssue(key, { fields: ["project", "issuetype"] });
    issue = issueRes.issue;
    resolvedProjectKey = resolvedProjectKey ?? issue.project?.key ?? null;
    resolvedIssueType = resolvedIssueType ?? issue.issuetype?.name ?? null;
  }

  const [fieldsRes, editMetaRes, transitionsRes, createMetaRes] = await Promise.all([
    request("api", { url: "/field", method: "GET" }),
    key ? request("api", { url: `/issue/${key}/editmeta`, method: "GET" }) : Promise.resolve(null),
    key ? request("api", { url: `/issue/${key}/transitions`, method: "GET" }) : Promise.resolve(null),
    resolvedProjectKey && resolvedIssueType
      ? request("api", {
          url: "/issue/createmeta",
          method: "GET",
          params: compactObject({
            projectKeys: resolvedProjectKey,
            issuetypeNames: resolvedIssueType,
            expand: "projects.issuetypes.fields",
          }),
        })
      : Promise.resolve(null),
  ]);

  return {
    issue,
    fields: fieldsRes.data,
    editmeta: editMetaRes?.data ?? null,
    transitions: transitionsRes?.data ?? null,
    createmeta: createMetaRes?.data ?? null,
    raw: {
      fields: fieldsRes.data,
      editmeta: editMetaRes?.data ?? null,
      transitions: transitionsRes?.data ?? null,
      createmeta: createMetaRes?.data ?? null,
    },
  };
}

export async function createIssue({
  projectKey,
  issueType = "Task",
  summary,
  description,
  fields,
  update,
  assignee,
  priority,
  parent,
}) {
  const body = buildWritePayload({
    projectKey,
    issueType,
    summary,
    description,
    fields,
    update,
    assignee,
    priority,
    parent,
  });
  const res = await request("api", { url: "/issue", method: "POST", data: body });
  return {
    key: res.data.key,
    raw: res.data,
  };
}

export async function transitionIssue(key, { transition, fields, update } = {}) {
  const res = await request("api", { url: `/issue/${key}/transitions`, method: "GET" });
  const transitions = res.data.transitions ?? [];
  const transitionId = typeof transition === "object" ? transition?.id : undefined;
  const transitionName = typeof transition === "string" ? transition : transition?.name;
  const target =
    transitionId !== undefined
      ? transitions.find((candidate) => String(candidate.id) === String(transitionId))
      : transitions.find(
          (candidate) =>
            candidate.name?.toLowerCase() === String(transitionName ?? "").toLowerCase()
        );

  if (!target) {
    throw new Error(
      `Transition not found. Available: ${transitions.map((candidate) => candidate.name).join(", ")}`
    );
  }

  const body = compactObject({
    transition: { id: target.id },
    fields,
    update,
  });

  const transitionRes = await request("api", {
    url: `/issue/${key}/transitions`,
    method: "POST",
    data: body,
  });

  return {
    updated: key,
    transition: {
      id: target.id,
      name: target.name,
      to: target.to?.name ?? null,
    },
    raw: transitionRes.data,
  };
}

export async function updateIssue(
  key,
  { summary, description, assignee, priority, status, transitionId, transitionName, fields, update, parent } = {}
) {
  const body = buildWritePayload({
    summary,
    description,
    assignee,
    priority,
    parent,
    fields,
    update,
  });

  if (status !== undefined || transitionId !== undefined || transitionName !== undefined) {
    const transition = transitionId !== undefined ? { id: transitionId } : transitionName ?? status;
    return transitionIssue(key, {
      transition,
      fields: body.fields,
      update: body.update,
    });
  }

  if (Object.keys(body).length > 0) {
    const res = await request("api", { url: `/issue/${key}`, method: "PUT", data: body });
    return { updated: key, raw: res.data };
  }

  return { updated: key };
}

export async function addComment(key, body) {
  const res = await request("api", {
    url: `/issue/${key}/comment`,
    method: "POST",
    data: { body: toADF(body) },
  });
  return normalizeComment(res.data);
}

export async function listProjects() {
  const res = await request("api", { url: "/project", method: "GET" });
  return (res.data ?? []).map(normalizeProject);
}

export async function getSprint(boardId, state = "active") {
  const res = await request("agile", { url: `/board/${boardId}/sprint`, method: "GET", params: { state } });
  const sprints = res.data.values ?? [];

  if (state === "active" && sprints.length > 0) {
    const sprint = sprints[0];
    const issues = await request("agile", {
      url: `/board/${boardId}/sprint/${sprint.id}/issue`,
      method: "GET",
    });
    return {
      sprint: normalizeSprint(sprint),
      issues: (issues.data.issues ?? []).map(normalizeIssueSummary),
      raw: {
        sprint,
        issues: issues.data,
      },
    };
  }

  return {
    sprints: sprints.map(normalizeSprint),
    raw: res.data,
  };
}

export function buildIssueWritePayload(input) {
  return buildWritePayload(input);
}
