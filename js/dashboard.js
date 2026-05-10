// ============================================================
//  ORACLE — Dashboard (dashboard.js)
//  v2: overdue task completion, get-ahead section
// ============================================================

import { guardPage, logout }                      from './auth.js';
import { getEngineData, logCompletion,
         getCompletionsForDay, toDateString }      from './db.js';
import { runEngine }                               from './matrix-engine.js';
import { today, formatDateLong, formatDate,
         unitLabel, deadlineLabel, deadlineClass,
         clLabel, clColor, categoryBadgeClass,
         toast, setHTML, openModal, closeModal,
         bindModalClose }                          from './utils.js';

// ── State ──
let currentUser      = null;
let engineOutput     = null;
let allTasks         = [];
let todayCompletions = {};
let todayStr         = today();
let logTargetTask    = null;

// ════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════
async function init() {
    currentUser = await guardPage();
    if (!currentUser) return;

    document.getElementById('nav-logout')
        .addEventListener('click', e => { e.preventDefault(); logout(); });

    await loadDashboard();
}

// ════════════════════════════════════════════════════════════
//  LOAD
// ════════════════════════════════════════════════════════════
async function loadDashboard() {
    try {
        const { tasks, completions, profile } = await getEngineData(currentUser.id);
        allTasks     = tasks;
        engineOutput = runEngine(tasks, completions, profile);

        const todayRows = await getCompletionsForDay(currentUser.id, todayStr);
        todayCompletions = {};
        for (const row of todayRows) {
            todayCompletions[row.task_id] = row.units_done;
        }

        renderDashboard(engineOutput, profile);

    } catch (err) {
        setHTML('#main-page', `
            <div class="alert alert-error" style="margin-top:var(--gap-xl);">
                Failed to load dashboard: ${err.message}
            </div>`);
    }
}

// ════════════════════════════════════════════════════════════
//  RENDER
// ════════════════════════════════════════════════════════════
function renderDashboard(output, profile) {
    const { todayPlan, stats, driftWarnings, schedule } = output;
    const name     = currentUser.user_metadata?.full_name?.split(' ')[0] || 'there';
    const hour     = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    const clRatio = todayPlan.clRatio;
    const clPct   = Math.min(100, Math.round(clRatio * 100));
    const clText  = clLabel(clRatio);
    const clCol   = clColor(clRatio);

    // Overdue = deadline before today AND work still remaining
    const overdueTasks = allTasks.filter(t => {
        const deadline = new Date(t.deadline + 'T00:00:00');
        const now      = new Date(todayStr   + 'T00:00:00');
        return deadline < now && t.completed_work < t.total_work;
    });

    const page = document.getElementById('main-page');
    page.innerHTML = `

        <!-- Today header -->
        <div class="today-header">
            <div class="today-date">${formatDateLong(todayStr)}</div>
            <div class="today-greeting">${greeting}, ${name} 👋</div>
            <div class="cl-section">
                <div class="cl-header">
                    <span class="cl-label">Today's Load</span>
                    <span class="cl-value" style="color:${clCol};">${clText} — ${clPct}%</span>
                </div>
                <div class="cl-bar">
                    <div class="cl-fill" style="width:${clPct}%;background:${clCol};"></div>
                </div>
                <p class="text-xs text-muted" style="margin-top:6px;">
                    ${todayPlan.load.toFixed(1)} / ${todayPlan.capacity}
                    ${profile?.default_unit || 'hours'} scheduled
                </p>
            </div>
        </div>

        <!-- Stats -->
        <div class="stats-row">
            <div class="stat-card">
                <span class="stat-label">Active</span>
                <span class="stat-value">${stats.totalActiveTasks}</span>
                <span class="stat-sub">tasks</span>
            </div>
            <div class="stat-card">
                <span class="stat-label">Overdue</span>
                <span class="stat-value"
                    style="color:${stats.overdueCount > 0 ? 'var(--danger)' : 'var(--success)'}">
                    ${stats.overdueCount}
                </span>
                <span class="stat-sub">tasks</span>
            </div>
            <div class="stat-card">
                <span class="stat-label">Due Soon</span>
                <span class="stat-value"
                    style="color:${stats.sprintCount > 0 ? 'var(--warning)' : 'var(--text)'}">
                    ${stats.sprintCount}
                </span>
                <span class="stat-sub">this week</span>
            </div>
        </div>

        <!-- Drift warnings -->
        ${driftWarnings.length > 0 ? driftBannerHTML(driftWarnings) : ''}

        <!-- Overdue tasks -->
        ${overdueTasks.length > 0 ? overdueHTML(overdueTasks) : ''}

        <!-- Today's plan -->
        <div class="section">
            <div class="section-title">Today's Plan</div>
            <div id="schedule-list">
                ${todayPlan.isOff
                    ? freeDayHTML()
                    : todayPlan.items.length === 0
                        ? emptyPlanHTML()
                        : scheduleListHTML(todayPlan.items)}
            </div>
        </div>

        <!-- Get Ahead (appears when today is done) -->
        <div id="get-ahead-section" class="section hidden">
            ${getAheadHTML(schedule)}
        </div>
    `;

    injectLogModal();

    document.querySelectorAll('.item-checkbox').forEach(btn => {
        btn.addEventListener('click', () =>
            toggleItem(btn.dataset.taskid, parseFloat(btn.dataset.units)));
    });

    document.querySelectorAll('.overdue-log-btn').forEach(btn => {
        btn.addEventListener('click', () => openLogModal(btn.dataset.taskid));
    });

    document.querySelectorAll('.ahead-checkbox').forEach(btn => {
        btn.addEventListener('click', () =>
            toggleAheadItem(btn.dataset.taskid, parseFloat(btn.dataset.units), btn.dataset.date));
    });

    bindModalClose('log-modal');
    checkGetAhead();
}

// ════════════════════════════════════════════════════════════
//  OVERDUE SECTION
// ════════════════════════════════════════════════════════════
function overdueHTML(tasks) {
    const items = tasks.map(t => {
        const rem = (t.total_work - t.completed_work).toFixed(1);
        return `
        <div class="schedule-item" data-strategy="BREACH"
             style="border-color:rgba(247,94,94,0.3);">
            <div class="item-body">
                <div class="item-title">${escapeHTML(t.title)}</div>
                <div class="item-meta">
                    <span class="${categoryBadgeClass(t.category)}">${t.category}</span>
                    <span class="badge badge-breach">OVERDUE</span>
                    <span class="text-xs text-danger">${deadlineLabel(t.deadline)}</span>
                </div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
                <span class="item-units text-danger">${rem} ${t.unit} left</span>
                <button class="btn btn-sm btn-danger overdue-log-btn"
                    data-taskid="${t.id}">Log Work</button>
            </div>
        </div>`;
    }).join('');

    return `
    <div class="section">
        <div class="section-title" style="color:var(--danger);">⚠ Overdue Tasks</div>
        <div style="display:flex;flex-direction:column;gap:var(--gap-sm);">${items}</div>
    </div>`;
}

// ════════════════════════════════════════════════════════════
//  LOG WORK MODAL
// ════════════════════════════════════════════════════════════
function injectLogModal() {
    if (document.getElementById('log-modal')) return;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'log-modal';
    modal.innerHTML = `
    <div class="modal" style="max-width:380px;">
        <div class="modal-header">
            <span class="modal-title">Log Work</span>
            <button class="btn-icon" onclick="
                document.getElementById('log-modal').classList.remove('open');
                document.body.style.overflow='';
            ">✕</button>
        </div>
        <div class="modal-body">
            <p class="text-sm text-muted" id="log-task-name"
               style="margin-bottom:var(--gap-md);font-weight:600;color:var(--text);"></p>
            <div class="form-group">
                <label class="form-label">Units Completed Today</label>
                <input class="form-input" id="log-units" type="number"
                    min="0.5" step="0.5" placeholder="e.g. 2" />
                <span class="form-hint" id="log-hint"></span>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" onclick="
                document.getElementById('log-modal').classList.remove('open');
                document.body.style.overflow='';
            ">Cancel</button>
            <button class="btn btn-primary" id="log-save-btn">Save</button>
        </div>
    </div>`;
    document.body.appendChild(modal);
}

function openLogModal(taskId) {
    logTargetTask = allTasks.find(t => t.id === taskId);
    if (!logTargetTask) return;

    const rem = (logTargetTask.total_work - logTargetTask.completed_work).toFixed(1);
    document.getElementById('log-task-name').textContent = logTargetTask.title;
    document.getElementById('log-hint').textContent =
        `${rem} ${logTargetTask.unit} still remaining`;
    document.getElementById('log-units').value = '';
    document.getElementById('log-units').max   = rem;

    const saveBtn = document.getElementById('log-save-btn');
    const newBtn  = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newBtn, saveBtn);
    newBtn.addEventListener('click', saveLogWork);

    document.getElementById('log-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
}

async function saveLogWork() {
    const units = parseFloat(document.getElementById('log-units').value);
    if (!units || units <= 0) { toast('Enter a valid amount.', 'error'); return; }

    const btn = document.getElementById('log-save-btn');
    btn.disabled = true; btn.textContent = 'Saving…';

    try {
        await logCompletion(currentUser.id, logTargetTask.id, todayStr, units);
        document.getElementById('log-modal').classList.remove('open');
        document.body.style.overflow = '';
        toast('Work logged ✓', 'success');
        await loadDashboard();
    } catch (err) {
        toast('Error: ' + err.message, 'error');
        btn.disabled = false; btn.textContent = 'Save';
    }
}

// ════════════════════════════════════════════════════════════
//  GET AHEAD
// ════════════════════════════════════════════════════════════
function getAheadHTML(schedule) {
    const futureDates = Object.keys(schedule)
        .filter(d => d > todayStr && schedule[d].items.length > 0)
        .sort();

    if (futureDates.length === 0) return '<p class="text-sm text-muted">No upcoming tasks scheduled.</p>';

    const nextDate = futureDates[0];
    const nextDay  = schedule[nextDate];

    const items = nextDay.items.map(item => `
        <div class="schedule-item" data-strategy="${item.strategy}" id="ahead-${item.taskId}">
            <button class="item-checkbox ahead-checkbox"
                data-taskid="${item.taskId}"
                data-units="${item.units}"
                data-date="${nextDate}"></button>
            <div class="item-body">
                <div class="item-title">${escapeHTML(item.title)}</div>
                <div class="item-meta">
                    <span class="${categoryBadgeClass(item.category)}">${item.category}</span>
                    <span class="badge ${stratBadgeClass(item.strategy)}">${item.strategy}</span>
                </div>
            </div>
            <div class="item-units">${unitLabel(item.units, item.unit)}</div>
        </div>`).join('');

    return `
        <div class="section-title" style="color:var(--success);">
            ✦ Get Ahead — ${formatDate(nextDate)}
        </div>
        <p class="text-sm text-muted" style="margin-bottom:var(--gap-md);">
            Today's plan is complete! Here's tomorrow's work if you want to get ahead.
        </p>
        <div style="display:flex;flex-direction:column;gap:var(--gap-sm);">${items}</div>`;
}

function checkGetAhead() {
    const items   = document.querySelectorAll('#schedule-list .schedule-item');
    const section = document.getElementById('get-ahead-section');
    if (!section) return;
    if (items.length === 0) return;
    const allDone = [...items].every(el => el.classList.contains('done'));
    allDone ? section.classList.remove('hidden') : section.classList.add('hidden');
}

async function toggleAheadItem(taskId, units, dateStr) {
    const btn    = document.querySelector(`.ahead-checkbox[data-taskid="${taskId}"]`);
    const item   = btn?.closest('.schedule-item');
    const isDone = item?.classList.contains('done');
    const newU   = isDone ? 0 : units;

    try {
        await logCompletion(currentUser.id, taskId, dateStr, newU);
        if (newU > 0) {
            item.classList.add('done'); btn.textContent = '✓';
            toast('Logged ahead ✓', 'success', 1500);
        } else {
            item.classList.remove('done'); btn.textContent = '';
            toast('Unmarked', 'info', 1500);
        }
    } catch (err) {
        toast('Error: ' + err.message, 'error');
    }
}

// ════════════════════════════════════════════════════════════
//  TODAY TOGGLE
// ════════════════════════════════════════════════════════════
async function toggleItem(taskId, units) {
    const alreadyDone = (todayCompletions[taskId] ?? 0) >= units;
    const newUnits    = alreadyDone ? 0 : units;

    try {
        await logCompletion(currentUser.id, taskId, todayStr, newUnits);
        todayCompletions[taskId] = newUnits;

        const btn  = document.querySelector(`.item-checkbox[data-taskid="${taskId}"]`);
        const item = btn?.closest('.schedule-item');
        if (!item) return;

        if (newUnits > 0) {
            item.classList.add('done'); btn.textContent = '✓';
            toast('Marked complete ✓', 'success', 1500);
        } else {
            item.classList.remove('done'); btn.textContent = '';
            toast('Unmarked', 'info', 1500);
        }
        checkGetAhead();
    } catch (err) {
        toast('Error saving: ' + err.message, 'error');
    }
}

// ════════════════════════════════════════════════════════════
//  SCHEDULE HTML
// ════════════════════════════════════════════════════════════
function scheduleListHTML(items) {
    return `<div style="display:flex;flex-direction:column;gap:var(--gap-sm);">
        ${items.map(item => scheduleItemHTML(item)).join('')}
    </div>`;
}

function scheduleItemHTML(item) {
    const isDone   = (todayCompletions[item.taskId] ?? 0) >= item.units;
    const catClass = categoryBadgeClass(item.category);
    const dlLabel  = deadlineLabel(item.deadline);
    const dlClass  = deadlineClass(item.deadline);

    return `
    <div class="schedule-item ${isDone ? 'done' : ''}" data-strategy="${item.strategy}">
        <button class="item-checkbox" data-taskid="${item.taskId}" data-units="${item.units}">
            ${isDone ? '✓' : ''}
        </button>
        <div class="item-body">
            <div class="item-title">${escapeHTML(item.title)}</div>
            <div class="item-meta">
                <span class="${catClass}">${item.category}</span>
                <span class="badge ${stratBadgeClass(item.strategy)}">${item.strategy}</span>
                <span class="badge badge-general ${dlClass}">${dlLabel}</span>
            </div>
        </div>
        <div class="item-units">${unitLabel(item.units, item.unit)}</div>
    </div>`;
}

// ════════════════════════════════════════════════════════════
//  OTHER HTML
// ════════════════════════════════════════════════════════════
function driftBannerHTML(warnings) {
    const items = warnings.slice(0, 3).map(w => `
        <div class="drift-item">
            <span>${escapeHTML(w.title)}</span>
            <span class="text-xs" style="color:var(--danger);">
                ${w.shortfall.toFixed(1)} ${w.unit} short
            </span>
        </div>`).join('');
    const extra = warnings.length > 3
        ? `<p class="text-xs text-muted" style="margin-top:6px;">+ ${warnings.length - 3} more</p>` : '';
    return `
    <div class="drift-banner">
        <div class="drift-title">⚠ Deadline Risk — ${warnings.length} task${warnings.length > 1 ? 's' : ''}</div>
        ${items}${extra}
        <p class="text-xs text-muted" style="margin-top:8px;">
            Consider extending deadlines in
            <a href="tasks.html" style="color:var(--accent);">Tasks</a>.
        </p>
    </div>`;
}

function emptyPlanHTML() {
    return `
    <div class="card free-day-card">
        <div class="free-icon">✦</div>
        <div class="free-title">Nothing scheduled today</div>
        <p class="text-sm text-muted">Add tasks with upcoming deadlines and ORACLE will fill your day.</p>
        <a href="tasks.html" class="btn btn-primary btn-sm" style="margin-top:var(--gap-md);">Add Tasks</a>
    </div>`;
}

function freeDayHTML() {
    return `
    <div class="card free-day-card">
        <div class="free-icon">◎</div>
        <div class="free-title">Rest Day</div>
        <p class="text-sm text-muted">Today is one of your off days. Enjoy the break.</p>
        <a href="settings.html" class="text-xs text-muted" style="margin-top:var(--gap-md);display:block;">
            Change off days in Settings
        </a>
    </div>`;
}

// ════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════
function stratBadgeClass(s) {
    return { BREACH:'badge-breach', SPRINT:'badge-sprint', MARATHON:'badge-marathon' }[s] || '';
}

function escapeHTML(str) {
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

init();
