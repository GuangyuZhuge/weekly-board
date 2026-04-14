const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");
const WEBHOOK_URL =
  "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=d7d4a58b-67fc-4757-b22d-db458230450b";

const TEAM_MEMBERS = ["syr", "zggy"];
const PUBLIC_FILES = new Set(["/index.html", "/styles.css", "/app.js"]);

ensureDataFile();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/health" && req.method === "GET") {
      return sendJson(res, 200, { ok: true, time: new Date().toISOString() });
    }

    if (url.pathname === "/api/members" && req.method === "GET") {
      return sendJson(res, 200, { members: TEAM_MEMBERS });
    }

    if (url.pathname === "/api/tasks" && req.method === "GET") {
      const tasks = readTasks();
      const weekStart = url.searchParams.get("weekStart");
      const filteredTasks = isIsoDate(weekStart)
        ? filterTasksByWeek(tasks, weekStart)
        : tasks;
      return sendJson(res, 200, { tasks: filteredTasks });
    }

    if (url.pathname === "/api/tasks" && req.method === "POST") {
      const body = await readJsonBody(req);
      const validation = validateTaskInput(body);

      if (!validation.ok) {
        return sendJson(res, 400, { error: validation.error });
      }

      const tasks = readTasks();
      const task = {
        id: createTaskId(),
        title: body.title.trim(),
        date: body.date,
        owners: body.owners.map((owner) => owner.trim()),
        note: (body.note || "").trim(),
        completed: Boolean(body.completed),
      };
      tasks.push(task);
      writeTasks(tasks);
      void notifyTaskChange("新增任务", task);
      return sendJson(res, 201, { task });
    }

    if (url.pathname.startsWith("/api/tasks/") && req.method === "PATCH") {
      const taskId = decodeURIComponent(url.pathname.replace("/api/tasks/", ""));
      const body = await readJsonBody(req);
      const validation = validateTaskPatchInput(body);

      if (!validation.ok) {
        return sendJson(res, 400, { error: validation.error });
      }

      const tasks = readTasks();
      const index = tasks.findIndex((task) => task.id === taskId);

      if (index === -1) {
        return sendJson(res, 404, { error: "任务不存在" });
      }

      tasks[index] = {
        ...tasks[index],
        ...(body.completed !== undefined ? { completed: body.completed } : {}),
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.date !== undefined ? { date: body.date } : {}),
        ...(body.owners !== undefined ? { owners: body.owners.map((owner) => owner.trim()) } : {}),
        ...(body.note !== undefined ? { note: body.note.trim() } : {}),
      };

      writeTasks(tasks);
      const action = body.completed !== undefined && !body.title && !body.date && !body.owners && body.note === undefined
        ? "任务完成状态更新"
        : "修改任务";
      void notifyTaskChange(action, tasks[index]);
      return sendJson(res, 200, { task: tasks[index] });
    }

    if (url.pathname.startsWith("/api/tasks/") && req.method === "DELETE") {
      const taskId = decodeURIComponent(url.pathname.replace("/api/tasks/", ""));

      if (!taskId) {
        return sendJson(res, 400, { error: "任务 ID 无效" });
      }

      const tasks = readTasks();
      const next = tasks.filter((task) => task.id !== taskId);

      if (next.length === tasks.length) {
        return sendJson(res, 404, { error: "任务不存在" });
      }

      writeTasks(next);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET") {
      return serveStaticFile(url.pathname, res);
    }

    return sendJson(res, 404, { error: "Not Found" });
  } catch (error) {
    return sendJson(res, 500, { error: "Server Error", detail: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(TASKS_FILE)) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(buildSeedTasks(), null, 2), "utf8");
  }
}

function buildSeedTasks() {
  const weekStart = startOfWeek(new Date());
  return [
    {
      id: createTaskId(),
      title: "确认本周迭代目标",
      date: toIsoDate(weekStart),
      owners: ["syr", "zggy"],
      note: "同步本周优先级，确认首页展示范围。",
      completed: false,
    },
    {
      id: createTaskId(),
      title: "整理接口字段清单",
      date: toIsoDate(addDays(weekStart, 2)),
      owners: ["syr"],
      note: "为后续接后端预留字段命名。",
      completed: false,
    },
    {
      id: createTaskId(),
      title: "走查提测前页面细节",
      date: toIsoDate(addDays(weekStart, 4)),
      owners: ["zggy"],
      note: "重点检查周切换和筛选场景。",
      completed: false,
    },
  ];
}

function readTasks() {
  ensureDataFile();
  const raw = fs.readFileSync(TASKS_FILE, "utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter(isTaskShape).map(normalizeTask);
}

function writeTasks(tasks) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), "utf8");
}

function validateTaskInput(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "请求体无效" };
  }

  if (typeof body.title !== "string" || !body.title.trim()) {
    return { ok: false, error: "任务名称不能为空" };
  }

  if (!isIsoDate(body.date)) {
    return { ok: false, error: "任务日期格式无效" };
  }

  if (!Array.isArray(body.owners) || body.owners.length < 1 || body.owners.length > 2) {
    return { ok: false, error: "负责人必须在 1-2 人之间" };
  }

  const invalidOwner = body.owners.find((owner) => !TEAM_MEMBERS.includes(owner));
  if (invalidOwner) {
    return { ok: false, error: `负责人不在成员列表中: ${invalidOwner}` };
  }

  if (body.note && typeof body.note !== "string") {
    return { ok: false, error: "备注格式无效" };
  }

  if (body.completed !== undefined && typeof body.completed !== "boolean") {
    return { ok: false, error: "completed 字段必须是布尔值" };
  }

  return { ok: true };
}

function validateTaskPatchInput(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "请求体无效" };
  }

  const hasCompleted = body.completed !== undefined;
  const hasTitle = body.title !== undefined;
  const hasDate = body.date !== undefined;
  const hasOwners = body.owners !== undefined;
  const hasNote = body.note !== undefined;

  if (!hasCompleted && !hasTitle && !hasDate && !hasOwners && !hasNote) {
    return { ok: false, error: "至少提供一个可更新字段" };
  }

  if (hasCompleted && typeof body.completed !== "boolean") {
    return { ok: false, error: "completed 字段必须是布尔值" };
  }

  if (hasTitle && (typeof body.title !== "string" || !body.title.trim())) {
    return { ok: false, error: "任务名称不能为空" };
  }

  if (hasDate && !isIsoDate(body.date)) {
    return { ok: false, error: "任务日期格式无效" };
  }

  if (hasOwners) {
    if (!Array.isArray(body.owners) || body.owners.length < 1 || body.owners.length > 2) {
      return { ok: false, error: "负责人必须在 1-2 人之间" };
    }

    const invalidOwner = body.owners.find((owner) => !TEAM_MEMBERS.includes(owner));
    if (invalidOwner) {
      return { ok: false, error: `负责人不在成员列表中: ${invalidOwner}` };
    }
  }

  if (hasNote && typeof body.note !== "string") {
    return { ok: false, error: "note 字段必须是字符串" };
  }

  return { ok: true };
}

function isTaskShape(task) {
  return (
    task &&
    typeof task.id === "string" &&
    typeof task.title === "string" &&
    typeof task.date === "string" &&
    Array.isArray(task.owners) &&
    (task.completed === undefined || typeof task.completed === "boolean")
  );
}

function normalizeTask(task) {
  return {
    ...task,
    completed: Boolean(task.completed),
  };
}

function isIsoDate(value) {
  if (typeof value !== "string") {
    return false;
  }
  const match = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!match) {
    return false;
  }
  const date = fromIsoDate(value);
  return toIsoDate(date) === value;
}

function serveStaticFile(pathname, res) {
  const resolvedPath = pathname === "/" ? "/index.html" : pathname;

  if (!PUBLIC_FILES.has(resolvedPath)) {
    return sendJson(res, 404, { error: "Not Found" });
  }

  const filePath = path.join(__dirname, resolvedPath.slice(1));
  if (!fs.existsSync(filePath)) {
    return sendJson(res, 404, { error: "File Not Found" });
  }

  const ext = path.extname(filePath);
  const contentType = getContentType(ext);
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { "Content-Type": contentType });
  res.end(content);
}

function getContentType(ext) {
  if (ext === ".html") {
    return "text/html; charset=utf-8";
  }
  if (ext === ".css") {
    return "text/css; charset=utf-8";
  }
  if (ext === ".js") {
    return "application/javascript; charset=utf-8";
  }
  if (ext === ".json") {
    return "application/json; charset=utf-8";
  }
  return "application/octet-stream";
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error("Payload Too Large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new Error("Invalid JSON"));
      }
    });

    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function createTaskId() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function filterTasksByWeek(tasks, weekStartIso) {
  const weekStart = fromIsoDate(weekStartIso);
  const weekEnd = addDays(weekStart, 6);
  return tasks.filter((task) => {
    const taskDate = fromIsoDate(task.date);
    return taskDate >= weekStart && taskDate <= weekEnd;
  });
}

function notifyTaskChange(action, task) {
  const payload = JSON.stringify({
    msgtype: "text",
    text: {
      content: buildWebhookMessage(action, task),
    },
  });

  return new Promise((resolve) => {
    const req = https.request(
      WEBHOOK_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        res.resume();
        res.on("end", resolve);
      },
    );

    req.on("error", (error) => {
      console.error("Webhook notify failed:", error.message);
      resolve();
    });

    req.write(payload);
    req.end();
  });
}

function buildWebhookMessage(action, task) {
  const owners = Array.isArray(task.owners) ? task.owners.join(", ") : "";
  const note = task.note ? task.note : "无";
  const completed = task.completed ? "已完成" : "未完成";

  return [
    `周任务看板${action}`,
    `标题：${task.title || ""}`,
    `日期：${task.date || ""}`,
    `负责人：${owners}`,
    `备注：${note}`,
    `状态：${completed}`,
  ].join("\n");
}

function startOfWeek(date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  const day = normalized.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  normalized.setDate(normalized.getDate() + diff);
  return normalized;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromIsoDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}
