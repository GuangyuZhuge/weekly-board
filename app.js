const DAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const TASK_SYNC_INTERVAL_MS = 5000;

const state = {
  currentWeekStart: startOfWeek(new Date()),
  selectedOwner: "",
  selectedTaskId: null,
  modalMode: "create",
  syncTimer: null,
  isSyncing: false,
  members: [],
  tasks: [],
};

const elements = {
  weekBoard: document.querySelector("#weekBoard"),
  emptyState: document.querySelector("#emptyState"),
  emptyStateTitle: document.querySelector("#emptyStateTitle"),
  emptyStateText: document.querySelector("#emptyStateText"),
  currentWeekBtn: document.querySelector("#currentWeekBtn"),
  weekRangeLabel: document.querySelector("#weekRangeLabel"),
  ownerFilters: document.querySelector("#ownerFilters"),
  openCreateTaskBtn: document.querySelector("#openCreateTaskBtn"),
  taskModal: document.querySelector("#taskModal"),
  taskModalBackdrop: document.querySelector("#taskModalBackdrop"),
  closeTaskModalBtn: document.querySelector("#closeTaskModalBtn"),
  taskModalForm: document.querySelector("#taskModalForm"),
  taskModalEyebrow: document.querySelector("#taskModalEyebrow"),
  taskModalTitle: document.querySelector("#taskModalTitle"),
  taskModalMeta: document.querySelector("#taskModalMeta"),
  modalTaskTitle: document.querySelector("#modalTaskTitle"),
  modalTaskDate: document.querySelector("#modalTaskDate"),
  modalOwnerField: document.querySelector("#modalOwnerField"),
  modalOwnerOptions: document.querySelector("#modalOwnerOptions"),
  modalTaskNote: document.querySelector("#modalTaskNote"),
  taskModalDeleteBtn: document.querySelector("#taskModalDeleteBtn"),
  taskModalSubmitBtn: document.querySelector("#taskModalSubmitBtn"),
  taskModalMessage: document.querySelector("#taskModalMessage"),
  prevWeekBtn: document.querySelector("#prevWeekBtn"),
  nextWeekBtn: document.querySelector("#nextWeekBtn"),
};

void boot();

async function boot() {
  bindEvents();
  renderLoadingState();

  try {
    const [members, tasks] = await Promise.all([
      apiGetMembers(),
      apiGetTasks(toIsoDate(state.currentWeekStart)),
    ]);
    state.members = members;
    state.tasks = tasks;
    renderOwnerOptions();
    renderOwnerFilters();
    render();
    startTaskSync();
  } catch (error) {
    showModalMessage(`初始化失败：${error.message}`);
  }
}

function bindEvents() {
  elements.prevWeekBtn.addEventListener("click", async () => {
    state.currentWeekStart = addDays(state.currentWeekStart, -7);
    await refreshCurrentWeekTasks();
    render();
  });

  elements.nextWeekBtn.addEventListener("click", async () => {
    state.currentWeekStart = addDays(state.currentWeekStart, 7);
    await refreshCurrentWeekTasks();
    render();
  });

  elements.currentWeekBtn.addEventListener("click", async () => {
    state.currentWeekStart = startOfWeek(new Date());
    await refreshCurrentWeekTasks();
    render();
  });

  elements.openCreateTaskBtn.addEventListener("click", openCreateModal);
  elements.taskModalBackdrop.addEventListener("click", closeTaskModal);
  elements.closeTaskModalBtn.addEventListener("click", closeTaskModal);
  elements.taskModalDeleteBtn.addEventListener("click", async () => {
    const task = getSelectedTask();
    if (!task) {
      return;
    }

    try {
      await apiDeleteTask(task.id);
      state.selectedTaskId = null;
      await refreshCurrentWeekTasks();
      render();
      closeTaskModal();
    } catch (error) {
      showModalMessage(`删除失败：${error.message}`);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.taskModal.hidden) {
      closeTaskModal();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopTaskSync();
      return;
    }

    void syncTasks({ immediate: true });
    startTaskSync();
  });

  elements.taskModalForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const title = elements.modalTaskTitle.value.trim();
    const date = elements.modalTaskDate.value;
    const owners = getModalTaskOwners();
    const note = elements.modalTaskNote.value.trim();

    if (!title) {
      showModalMessage("请填写任务名称。");
      return;
    }

    if (!date) {
      showModalMessage("请选择任务日期。");
      return;
    }

    if (owners.length === 0 || owners.length > 2) {
      showModalMessage("请选择 1 到 2 位负责人。");
      return;
    }

    try {
      if (state.modalMode === "create") {
        await apiCreateTask({ title, date, owners, note });
        state.currentWeekStart = startOfWeek(fromIsoDate(date));
        await refreshCurrentWeekTasks();
        showModalMessage(`已发布任务：${title}`);
        render();
        closeTaskModal();
        return;
      }

      const task = getSelectedTask();
      if (!task) {
        showModalMessage("请先选择一个任务。");
        return;
      }

      const updated = await apiUpdateTask(task.id, {
        title,
        date,
        owners,
        note,
      });
      state.currentWeekStart = startOfWeek(fromIsoDate(updated.date));
      await refreshCurrentWeekTasks();
      showModalMessage("已保存。");
      render();
      closeTaskModal();
    } catch (error) {
      showModalMessage(`${state.modalMode === "create" ? "发布" : "保存"}失败：${error.message}`);
    }
  });

  elements.modalOwnerOptions.addEventListener("change", (event) => {
    const changed = event.target.closest('input[name="modalOwners"]');
    if (!changed) {
      return;
    }

    const selectedOwners = getModalTaskOwners();
    if (selectedOwners.length <= 2) {
      return;
    }

    changed.checked = false;
    showModalMessage("负责人最多只能选择 2 人。");
  });

  elements.ownerFilters.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-owner]");
    if (!button) {
      return;
    }

    const owner = button.dataset.owner;
    if (owner === "all") {
      state.selectedOwner = "";
      renderOwnerFilters();
      render();
      return;
    }

    state.selectedOwner = state.selectedOwner === owner ? "" : owner;

    renderOwnerFilters();
    render();
  });

  elements.weekBoard.addEventListener("click", async (event) => {
    if (
      event.target.closest("input[data-task-check-id]") ||
      event.target.closest(".check-wrap")
    ) {
      return;
    }

    const taskCard = event.target.closest("[data-task-card-id]");
    if (!taskCard) {
      if (event.target === elements.weekBoard) {
        openCreateModal();
      }
      return;
    }

    state.selectedTaskId = taskCard.dataset.taskCardId;
    openEditModal();
  });

  elements.weekBoard.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const taskCard = event.target.closest("[data-task-card-id]");
    if (!taskCard) {
      return;
    }

    event.preventDefault();
    state.selectedTaskId = taskCard.dataset.taskCardId;
    openEditModal();
  });

  elements.weekBoard.addEventListener("change", async (event) => {
    const checkbox = event.target.closest("input[data-task-check-id]");
    if (!checkbox) {
      return;
    }

    const taskId = checkbox.dataset.taskCheckId;
    const completed = checkbox.checked;

    try {
      const updated = await apiUpdateTask(taskId, { completed });
      state.tasks = state.tasks.map((task) => (task.id === taskId ? updated : task));
      showModalMessage(completed ? "任务已标记为完成。" : "任务已标记为未完成。");
      render();
    } catch (error) {
      checkbox.checked = !completed;
      showModalMessage(`更新失败：${error.message}`);
    }
  });
}

function renderLoadingState() {
  elements.weekRangeLabel.textContent = "加载中...";
  elements.emptyState.hidden = false;
  elements.emptyStateTitle.textContent = "正在加载任务";
  elements.emptyStateText.textContent = "请稍候，正在连接本地协同服务。";
}

function render() {
  const weekTasks = [...state.tasks].sort((a, b) => a.date.localeCompare(b.date));
  const filteredTasks = applyOwnerFilter(weekTasks);
  const hasWeekTasks = weekTasks.length > 0;
  const hasVisibleTasks = filteredTasks.length > 0;
  const isCurrentWeek = isSameWeek(state.currentWeekStart, startOfWeek(new Date()));

  elements.weekRangeLabel.textContent = formatWeekRange(state.currentWeekStart);
  elements.currentWeekBtn.classList.toggle("is-current-week", isCurrentWeek);
  elements.currentWeekBtn.classList.toggle("is-other-week", !isCurrentWeek);
  elements.emptyState.hidden = hasVisibleTasks;

  if (!hasWeekTasks) {
    elements.emptyStateTitle.textContent = "这一周还没有任务";
    elements.emptyStateText.textContent = "点击空白区域即可弹出添加任务页。";
  } else if (!hasVisibleTasks) {
    elements.emptyStateTitle.textContent = "当前筛选条件下没有任务";
    elements.emptyStateText.textContent = "可以取消负责人筛选，或者继续切换到其他周查看。";
  }

  if (state.selectedTaskId && !state.tasks.some((task) => task.id === state.selectedTaskId)) {
    state.selectedTaskId = null;
  }

  elements.weekBoard.innerHTML = filteredTasks.length
    ? filteredTasks.map(renderTaskRow).join("")
    : '<p class="task-empty">暂无任务</p>';
}

function renderTaskRow(task) {
  const weekdayLabel = formatWeekday(task.date);
  const owners = task.owners.map((owner) => escapeHtml(owner)).join(" / ");
  const noteMarkup = task.note ? `<p class="task-note">${escapeHtml(task.note)}</p>` : "";
  const isSelected = state.selectedTaskId === task.id;

  return `
    <section
      class="task-card ${task.completed ? "is-completed" : ""} ${isSelected ? "is-selected" : ""}"
      data-task-card-id="${task.id}"
      tabindex="0"
    >
      <div class="task-main-line">
        <div class="task-heading-wrap">
          <h4>${escapeHtml(task.title)}</h4>
          <p class="task-inline-meta">${owners} · ${weekdayLabel}</p>
        </div>
      </div>
      ${noteMarkup}
      <div class="task-actions">
        <label class="check-wrap">
          <span>完成</span>
          <input
            type="checkbox"
            data-task-check-id="${task.id}"
            ${task.completed ? "checked" : ""}
          />
        </label>
      </div>
    </section>
  `;
}

function renderOwnerFilters() {
  const chips = [
    `<button class="chip ${state.selectedOwner === "" ? "active" : ""}" type="button" data-owner="all">全部</button>`,
    ...state.members.map(
      (owner) => `
        <button
          class="chip ${state.selectedOwner === owner ? "active" : ""}"
          type="button"
          data-owner="${owner}"
        >
          ${owner}
        </button>
      `,
    ),
  ];

  elements.ownerFilters.innerHTML = chips.join("");
}

function renderOwnerOptions() {
  elements.modalOwnerOptions.innerHTML = state.members
    .map(
      (owner) => `
      <label class="owner-option">
        <input type="checkbox" name="modalOwners" value="${owner}" />
        <span>${owner}</span>
      </label>
    `,
    )
    .join("");
}

function getModalTaskOwners() {
  return Array.from(
    elements.modalOwnerOptions.querySelectorAll('input[name="modalOwners"]:checked'),
    (input) => input.value,
  );
}

function getSelectedTask() {
  return state.tasks.find((task) => task.id === state.selectedTaskId) || null;
}

function isSameWeek(left, right) {
  return toIsoDate(startOfWeek(left)) === toIsoDate(startOfWeek(right));
}

function applyOwnerFilter(tasks) {
  if (!state.selectedOwner) {
    return tasks;
  }
  return tasks.filter((task) => task.owners.includes(state.selectedOwner));
}

function showModalMessage(message) {
  elements.taskModalMessage.textContent = message;
}

function openCreateModal() {
  state.modalMode = "create";
  state.selectedTaskId = null;
  elements.taskModalEyebrow.textContent = "添加任务";
  elements.taskModalTitle.textContent = "发布任务";
  elements.taskModalMeta.textContent = "填写后点击发布。";
  elements.taskModalSubmitBtn.textContent = "发布";
  elements.taskModalDeleteBtn.hidden = true;
  elements.modalOwnerField.hidden = false;
  elements.taskModalForm.reset();
  elements.modalTaskDate.value = toIsoDate(state.currentWeekStart);
  clearModalOwnerOptions();
  showModalMessage("");
  openTaskModal();
}

function openEditModal() {
  const task = getSelectedTask();
  if (!task) {
    return;
  }

  state.modalMode = "edit";
  elements.taskModalEyebrow.textContent = "修改备注";
  elements.taskModalTitle.textContent = "保存任务";
  elements.taskModalMeta.textContent = `${task.owners.join(" / ")} · ${task.date}`;
  elements.taskModalSubmitBtn.textContent = "保存";
  elements.taskModalDeleteBtn.hidden = false;
  elements.modalOwnerField.hidden = false;
  elements.modalTaskTitle.value = task.title;
  elements.modalTaskDate.value = task.date;
  elements.modalTaskNote.value = task.note || "";
  setModalOwnerOptions(task.owners);
  showModalMessage("");
  openTaskModal();
}

function openTaskModal() {
  elements.taskModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeTaskModal() {
  elements.taskModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function startTaskSync() {
  stopTaskSync();
  state.syncTimer = window.setInterval(() => {
    void syncTasks();
  }, TASK_SYNC_INTERVAL_MS);
}

function stopTaskSync() {
  if (state.syncTimer === null) {
    return;
  }

  window.clearInterval(state.syncTimer);
  state.syncTimer = null;
}

async function syncTasks(options = {}) {
  if (state.isSyncing) {
    return;
  }

  if (!options.immediate && !elements.taskModal.hidden) {
    return;
  }

  state.isSyncing = true;

  try {
    const tasks = await apiGetTasks(toIsoDate(state.currentWeekStart));
    if (serializeTasks(tasks) === serializeTasks(state.tasks)) {
      return;
    }

    state.tasks = tasks;
    if (state.selectedTaskId && !tasks.some((task) => task.id === state.selectedTaskId)) {
      state.selectedTaskId = null;
    }
    render();
  } catch (error) {
    console.error("Task sync failed:", error.message);
  } finally {
    state.isSyncing = false;
  }
}

function serializeTasks(tasks) {
  return JSON.stringify(tasks);
}

function setModalOwnerOptions(selectedOwners) {
  const checkboxes = elements.modalOwnerOptions.querySelectorAll('input[name="modalOwners"]');
  checkboxes.forEach((checkbox) => {
    checkbox.checked = selectedOwners.includes(checkbox.value);
  });
}

function clearModalOwnerOptions() {
  setModalOwnerOptions([]);
}

async function apiGetMembers() {
  const res = await fetch("/api/members");
  const data = await readResponseJson(res);
  return Array.isArray(data.members) ? data.members : [];
}

async function apiGetTasks(weekStart) {
  const query = weekStart ? `?weekStart=${encodeURIComponent(weekStart)}` : "";
  const res = await fetch(`/api/tasks${query}`);
  const data = await readResponseJson(res);
  return Array.isArray(data.tasks) ? data.tasks : [];
}

async function refreshCurrentWeekTasks() {
  state.tasks = await apiGetTasks(toIsoDate(state.currentWeekStart));
  if (state.selectedTaskId && !state.tasks.some((task) => task.id === state.selectedTaskId)) {
    state.selectedTaskId = null;
  }
}

async function apiCreateTask(payload) {
  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await readResponseJson(res);
  if (!data.task) {
    throw new Error("服务端未返回任务");
  }
  return data.task;
}

async function apiDeleteTask(taskId) {
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
  });
  await readResponseJson(res);
}

async function apiUpdateTask(taskId, payload) {
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await readResponseJson(res);
  if (!data.task) {
    throw new Error("服务端未返回任务");
  }
  return data.task;
}

async function readResponseJson(res) {
  let data = {};
  try {
    data = await res.json();
  } catch (error) {
    data = {};
  }

  if (!res.ok) {
    const message = data.error || `请求失败（${res.status}）`;
    throw new Error(message);
  }
  return data;
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

function formatWeekRange(weekStart) {
  const weekEnd = addDays(weekStart, 6);
  return `${formatMonthDay(weekStart)}-${formatMonthDay(weekEnd)}`;
}

function formatWeekday(isoDate) {
  const date = fromIsoDate(isoDate);
  const day = date.getDay();
  const index = day === 0 ? 6 : day - 1;
  return DAY_LABELS[index];
}

function formatChineseDate(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatMonthDay(date) {
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
