// ============================================================
//  ORACLE — Tasks Page (tasks.js)
//  Handles: listing tasks, add/edit modal, delete confirm
// ============================================================

import { guardPage, logout }                        from './auth.js';
import { getTasks, createTask, updateTask,
         deleteTask, toDateString, addDays }         from './db.js';
import { progressPercent, remainingWork, unitLabel,
         deadlineLabel, deadlineClass, priorityLabel,
         categoryBadgeClass, priorityBadgeClass,
         openModal, closeModal, bindModalClose,
         toast, today, $, setHTML }                  from './utils.js';

// ── State ──
let currentUser  = null;
let allTasks     = [];
let activeFilter = 'all';
let editingId    = null;   // task ID when in edit mode, null when adding

// ════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════
async function init() {
    currentUser = await guardPage();
    if (!currentUser) return;

    // Logout button
    document.getElementById('nav-logout')
        .addEventListener('click', e => { e.preventDefault(); logout(); });

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn')
                .forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.dataset.filter;
            renderTasks();
        });
    });

    // Close modals on overlay click
    bindModalClose('task-modal');
    bindModalClose('delete-modal');

    // Set minimum date for deadline picker to today
    document.getElementById('f-deadline').min = today();

    await loadTasks();
}

// ════════════════════════════════════════════════════════════
//  LOAD & RENDER
// ════════════════════════════════════════════════════════════
async function loadTasks() {
    try {
        allTasks = await getTasks(currentUser.id);
        renderTasks();
    } catch (err) {
        setHTML('#task-list', `<div class="alert alert-error">Failed to load tasks: ${err.message}</div>`);
    }
}

function renderTasks() {
    const filtered = activeFilter === 'all'
        ? allTasks
        : allTasks.filter(t => t.category === activeFilter);

    // Update count label
    const total = allTasks.length;
    const shown = filtered.length;
    document.getElementById('task-count').textContent =
        activeFilter === 'all'
            ? `${total} active task${total !== 1 ? 's' : ''}`
            : `${shown} of ${total} tasks`;

    if (filtered.length === 0) {
        setHTML('#task-list', `
            <div class="empty-state">
                <div class="empty-icon">✦</div>
                <div class="empty-title">No tasks here</div>
                <div class="empty-desc">
                    ${activeFilter === 'all'
                        ? 'Add your first task using the button above.'
                        : `No ${activeFilter} tasks yet.`}
                </div>
            </div>
        `);
        return;
    }

    // Sort: overdue first, then by deadline
    const sorted = [...filtered].sort((a, b) => {
        const dA = new Date(a.deadline);
        const dB = new Date(b.deadline);
        return dA - dB;
    });

    const html = sorted.map(task => taskCardHTML(task)).join('');
    setHTML('#task-list', `<div style="display:flex;flex-direction:column;gap:var(--gap-sm);">${html}</div>`);

    // Bind edit and delete buttons after rendering
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => openDeleteConfirm(btn.dataset.id, btn.dataset.title));
    });
}

function taskCardHTML(task) {
    const pct      = progressPercent(task);
    const rem      = remainingWork(task);
    const dlLabel  = deadlineLabel(task.deadline);
    const dlClass  = deadlineClass(task.deadline);
    const catClass = categoryBadgeClass(task.category);
    const priClass = priorityBadgeClass(task.priority);
    const priLabel = priorityLabel(task.priority);
    const remLabel = unitLabel(rem, task.unit);
    const fillClass = pct >= 100 ? 'success' : pct >= 70 ? 'warning' : '';

    return `
    <div class="task-card ${pct >= 100 ? 'completed' : ''}" data-category="${task.category}">
        <div class="task-header">
            <span class="task-title">${escapeHTML(task.title)}</span>
            <div class="flex gap-sm">
                <button class="btn-icon edit-btn" data-id="${task.id}" title="Edit">✎</button>
                <button class="btn-icon delete-btn" data-id="${task.id}"
                    data-title="${escapeHTML(task.title)}" title="Delete"
                    style="color:var(--danger);">✕</button>
            </div>
        </div>

        <div class="task-meta">
            <span class="${catClass}">${task.category}</span>
            <span class="${priClass}">${priLabel}</span>
            <span class="badge badge-general ${dlClass}">${dlLabel}</span>
        </div>

        <div class="progress-wrap">
            <div class="progress-bar">
                <div class="progress-fill ${fillClass}" style="width:${pct}%"></div>
            </div>
            <div class="progress-labels">
                <span>${pct}% done</span>
                <span>${pct < 100 ? remLabel + ' left' : 'Complete ✓'}</span>
            </div>
        </div>

        ${task.notes ? `<p class="text-sm text-muted">${escapeHTML(task.notes)}</p>` : ''}
    </div>`;
}


// ════════════════════════════════════════════════════════════
//  ADD MODAL
// ════════════════════════════════════════════════════════════
window.openAddModal = function() {
    editingId = null;
    document.getElementById('modal-title').textContent      = 'Add Task';
    document.getElementById('modal-save-btn').textContent   = 'Save Task';
    document.getElementById('f-task-id').value  = '';
    document.getElementById('f-title').value    = '';
    document.getElementById('f-category').value = 'General';
    document.getElementById('f-priority').value = '3';
    document.getElementById('f-total').value    = '';
    document.getElementById('f-unit').value     = 'hours';
    document.getElementById('f-deadline').value = '';
    document.getElementById('f-notes').value    = '';
    openModal('task-modal');
};


// ════════════════════════════════════════════════════════════
//  EDIT MODAL
// ════════════════════════════════════════════════════════════
function openEditModal(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;

    editingId = taskId;
    document.getElementById('modal-title').textContent    = 'Edit Task';
    document.getElementById('modal-save-btn').textContent = 'Save Changes';
    document.getElementById('f-task-id').value   = task.id;
    document.getElementById('f-title').value     = task.title;
    document.getElementById('f-category').value  = task.category;
    document.getElementById('f-priority').value  = task.priority;
    document.getElementById('f-total').value     = task.total_work;
    document.getElementById('f-unit').value      = task.unit;
    document.getElementById('f-deadline').value  = task.deadline;
    document.getElementById('f-notes').value     = task.notes || '';
    openModal('task-modal');
}

window.closeTaskModal = function() { closeModal('task-modal'); };


// ════════════════════════════════════════════════════════════
//  SAVE TASK (add or edit)
// ════════════════════════════════════════════════════════════
window.saveTask = async function() {
    const title    = document.getElementById('f-title').value.trim();
    const category = document.getElementById('f-category').value;
    const priority = parseInt(document.getElementById('f-priority').value);
    const total    = parseFloat(document.getElementById('f-total').value);
    const unit     = document.getElementById('f-unit').value;
    const deadline = document.getElementById('f-deadline').value;
    const notes    = document.getElementById('f-notes').value.trim();

    // Validation
    if (!title)    { toast('Please enter a task title.', 'error'); return; }
    if (!total || total <= 0) { toast('Please enter the total work amount.', 'error'); return; }
    if (!deadline) { toast('Please set a deadline.', 'error'); return; }

    const btn = document.getElementById('modal-save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
        if (editingId) {
            // Edit existing task
            await updateTask(editingId, { title, category, priority, total_work: total, unit, deadline, notes });
            toast('Task updated.', 'success');
        } else {
            // Create new task
            await createTask(currentUser.id, { title, category, priority, total_work: total, unit, deadline, notes });
            toast('Task added!', 'success');
        }

        closeModal('task-modal');
        await loadTasks();
    } catch (err) {
        toast('Error: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = editingId ? 'Save Changes' : 'Save Task';
    }
};


// ════════════════════════════════════════════════════════════
//  DELETE
// ════════════════════════════════════════════════════════════
function openDeleteConfirm(taskId, taskTitle) {
    document.getElementById('delete-task-name').textContent = taskTitle;
    const confirmBtn = document.getElementById('confirm-delete-btn');

    // Remove old listener to avoid stacking
    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

    newBtn.addEventListener('click', async () => {
        newBtn.disabled = true;
        newBtn.textContent = 'Deleting…';
        try {
            await deleteTask(taskId);
            closeModal('delete-modal');
            toast('Task deleted.', 'warning');
            await loadTasks();
        } catch (err) {
            toast('Error: ' + err.message, 'error');
            newBtn.disabled = false;
            newBtn.textContent = 'Delete';
        }
    });

    openModal('delete-modal');
}


// ════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════
function escapeHTML(str) {
    return String(str)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;');
}

// ── Start ──
init();
