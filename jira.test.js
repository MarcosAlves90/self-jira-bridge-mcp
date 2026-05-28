import test from "node:test";
import assert from "node:assert/strict";
import { buildIssueWritePayload, extractText, normalizeIssue, toADF } from "./jira.js";

test("toADF splits plain text into paragraphs", () => {
  assert.deepStrictEqual(toADF("first line\n\nthird line"), {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "first line" }],
      },
      {
        type: "paragraph",
        content: [],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "third line" }],
      },
    ],
  });
});

test("extractText flattens nested ADF content", () => {
  const adf = {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Hello" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "World" }],
      },
    ],
  };

  assert.equal(extractText(adf), "Hello\nWorld");
});

test("buildIssueWritePayload merges fields and convenience inputs", () => {
  const payload = buildIssueWritePayload({
    projectKey: "PROJ",
    issueType: "Bug",
    summary: "Fix it",
    description: "Line one\nLine two",
    assignee: "account-123",
    priority: "High",
    parent: "PROJ-1",
    fields: {
      labels: ["urgent"],
    },
    update: {
      comment: [{ add: { body: "side effect" } }],
    },
  });

  assert.deepStrictEqual(payload, {
    fields: {
      labels: ["urgent"],
      project: { key: "PROJ" },
      issuetype: { name: "Bug" },
      summary: "Fix it",
      description: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Line one" }],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Line two" }],
          },
        ],
      },
      assignee: { accountId: "account-123" },
      priority: { name: "High" },
      parent: { key: "PROJ-1" },
    },
    update: {
      comment: [{ add: { body: "side effect" } }],
    },
  });
});

test("normalizeIssue exposes raw issue data and common fields", () => {
  const raw = {
    id: "10001",
    key: "PROJ-1",
    self: "https://example.atlassian.net/rest/api/3/issue/10001",
    fields: {
      summary: "Example issue",
      description: toADF("First line\nSecond line"),
      status: {
        id: "3",
        name: "In Progress",
        statusCategory: { name: "In Progress" },
      },
      issuetype: {
        id: "10000",
        name: "Task",
        subtask: false,
      },
      project: {
        id: "20000",
        key: "PROJ",
        name: "Project",
      },
      assignee: {
        accountId: "abc",
        displayName: "Alice",
      },
      reporter: {
        accountId: "def",
        displayName: "Bob",
      },
      creator: {
        accountId: "ghi",
        displayName: "Carol",
      },
      priority: { name: "High" },
      resolution: { name: "Done" },
      parent: {
        key: "PROJ-0",
        fields: { summary: "Parent issue" },
      },
      labels: ["one", "two"],
      components: [{ id: "1", name: "API" }],
      fixVersions: [{ id: "2", name: "1.0" }],
      versions: [{ id: "3", name: "2.0" }],
      subtasks: [{ key: "PROJ-2", fields: { summary: "Child", status: { name: "Done" } } }],
      created: "2024-01-01T00:00:00.000Z",
      updated: "2024-01-02T00:00:00.000Z",
    },
  };

  assert.deepStrictEqual(normalizeIssue(raw), {
    id: "10001",
    key: "PROJ-1",
    self: "https://example.atlassian.net/rest/api/3/issue/10001",
    summary: "Example issue",
    description: "First line\nSecond line",
    status: {
      id: "3",
      name: "In Progress",
      statusCategory: "In Progress",
    },
    issuetype: {
      id: "10000",
      name: "Task",
      subtask: false,
    },
    project: {
      id: "20000",
      key: "PROJ",
      name: "Project",
    },
    assignee: {
      accountId: "abc",
      displayName: "Alice",
      emailAddress: null,
      active: null,
    },
    reporter: {
      accountId: "def",
      displayName: "Bob",
      emailAddress: null,
      active: null,
    },
    creator: {
      accountId: "ghi",
      displayName: "Carol",
      emailAddress: null,
      active: null,
    },
    priority: "High",
    resolution: "Done",
    parent: {
      key: "PROJ-0",
      summary: "Parent issue",
    },
    labels: ["one", "two"],
    components: [{ id: "1", key: null, name: "API", value: null }],
    fixVersions: [{ id: "2", key: null, name: "1.0", value: null }],
    versions: [{ id: "3", key: null, name: "2.0", value: null }],
    subtasks: [
      {
        key: "PROJ-2",
        summary: "Child",
        status: "Done",
      },
    ],
    created: "2024-01-01T00:00:00.000Z",
    updated: "2024-01-02T00:00:00.000Z",
    raw,
  });
});
