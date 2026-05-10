// ============================================================
//  ORACLE — Dashboard (dashboard.js)
//  Shows today's auto-planned schedule, CL bar,
//  drift warnings, and lets users mark work done.
// ============================================================

import { guardPage, logout }                      from './auth.js';
import { getEngineData, logCompletion,
         getCompletionsForDay, toDateString }      from './db.js';
import { runEngine }                               from './matrix-engine.js';
import { today, formatDateLong, unitLabel,
         deadlineLabel, deadlineClass,
         clLabel, clClass, clColor,
         categoryBadgeClass, priorityBadgeClass,
         toast, setHTML, $  }                      from './utils.js';

// ── State ──
let currentUser   = null;
let engineOutput  = null;
let todayCompletions = {};  // { taskId: unitsDone }
let todayStr      = today();

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
//  LOAD — fetch data, run engine, render
// ════════════════════════════════════════════════════════════
async function loadDashboard() {
    try {
        // Fetch all engine data in one call
        const { tasks, completions, profile } = await getEngineData(currentUser.id);

        // Run the Matrix Engine
        engineOutput = runEngine(tasks, completions, profile);

        // Get what was already completed today (for checkbox state)
        const todayRows = await getCompletionsForDay(currentUser.id, todayStr);
        todayCompletions = {};
        for (const row of todayRows) {
            todayCompletions[row.task_id] = row.units_done;
        }

        // Render everything
        renderDashboard(engineOutput, profile);

    } catch (err) {
        setHTML('#main-page', `
            <div class="alert alert-error" style="margin-top:var(--gap-xl);">
                Failed to load dashboard: ${err.message}
            </div>
        `);
    }
}

// ════════════════════════════════════════════════════════════
//  RENDER
// ════════════════════════════════════════════════════════════
function renderDashboard(output, profile) {
    const { todayPlan, stats, driftWarnings } = output;
    const name = currentUser.user_metadata?.full_name?.split(' ')[0] || 'there';
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    // CL values
    const clRatio = todayPlan.clRatio;
    const clPct   = Math.min(100, Math.round(clRatio * 100));
    const clText  = clLabel(clRatio);
    const clCol   = clColor(clRatio);

    const page = document.getElementById('main-page');
    page.innerHTML = `

        <!-- ── Today header ── -->
        <div class="today-header">
            <div class="today-date">${formatDateLong(todayStr)}</div>
            <div class="today-greeting">${greeting}, ${name} 👋</div>

            <!-- CL bar -->
            <div class="cl-section">
                <div class="cl-header">
                    <span class="cl-label">Today's Load</span>
                    <span class="cl-value" style="color:${clCol};">${clText} — ${clPct}%</span>
                </div>
                <div class="cl-bar">
                    <div class="cl-fill" style="width:${clPct}%; background:${clCol};"></div>
                </div>
                <p class="text-xs text-muted" style="margin-top:6px;">
                    ${todayPlan.load.toFixed(1)} / ${todayPlan.capacity} ${profile?.default_unit || 'hours'} scheduled
                </p>
            </div>
        </div>

        <!-- ── Stats row ── -->
        <div class="stats-row">
            <div class="stat-card">
                <span class="stat-label">Active</span>
                <span class="stat-value">${stats.totalActiveTasks}</span>
                <span class="stat-sub">tasks</span>
            </div>
            <div class="stat-card">
                <span class="stat-label">Overdue</span>
                <span class="stat-value" style="color:${stats.overdueCount > 0 ? 'var(--danger)' : 'var(--success)'}">
                    ${stats.overdueCount}
                </span>
                <span class="stat-sub">tasks</span>
            </div>
            <div class="stat-card">
                <span class="stat-label">Due Soon</span>
                <span class="stat-value" style="color:${stats.sprintCount > 0 ? 'var(--warning)' : 'var(--text)'}">
                    ${stats.sprintCount}
                </span>
                <span class="stat-sub">this week</span>
            </div>
        </div>

        <!-- ── Drift warnings ── -->
        ${driftWarnings.length > 0 ? driftBannerHTML(driftWarnings) : ''}

        <!-- ── Today's schedule ── -->
        <div class="section">
            <div class="section-title">Today's Plan</div>
            <div id="schedule-list">
                ${todayPlan.isOff
                    ? freeDayHTML()
                    : todayPlan.items.length === 0
                        ? emptyPlanHTML()
                        : scheduleListHTML(todayPlan.items)
                }
            </div>
        </div>
    `;

    // Bind checkbox clicks after rendering
    document.querySelectorAll('.item-checkbox').forEach(btn => {
        btn.addEventListener('click', () => toggleItem(btn.dataset.taskid, parseFloat(btn.dataset.units)));
    });
}

// ════════════════════════════════════════════════════════════
//  SCHEDULE LIST HTML
// ════════════════════════════════════════════════════════════
function scheduleListHTML(items) {
    return `<div style="display:flex;flex-direction:column;gap:var(--gap-sm);">
        ${items.map(item => scheduleItemHTML(item)).join('')}
    </div>`;
}

function scheduleItemHTML(item) {
    const isDone    = (todayCompletions[item.taskId] ?? 0) >= item.units;
    const catClass  = categoryBadgeClass(item.category);
    const dlLabel   = deadlineLabel(item.deadline);
    const dlClass   = deadlineClass(item.deadline);
    const unitsText = unitLabel(item.units, item.unit);

    const strategyColors = {
        BREACH:   'badge-breach',
        SPRINT:   'badge-sprint',
        MARATHON: 'badge-marathon',
    };
    const stratBadge = `<span class="badge ${strategyColors[item.strategy] || ''}">${item.strategy}</span>`;

    return `
    <div class="schedule-item ${isDone ? 'done' : ''}" data-strategy="${item.strategy}">
        <button class="item-checkbox" data-taskid="${item.taskId}" data-units="${item.units}">
            ${isDone ? '✓' : ''}
        </button>
        <div class="item-body">
            <div class="item-title">${escapeHTML(item.title)}</div>
            <div class="item-meta">
                <span class="${catClass}">${item.category}</span>
                ${stratBadge}
                <span class="badge badge-general ${dlClass}">${dlLabel}</span>
            </div>
        </div>
        <div class="item-units">${unitsText}</div>
    </div>`;
}

// ════════════════════════════════════════════════════════════
//  DRIFT BANNER HTML
// ════════════════════════════════════════════════════════════
function driftBannerHTML(warnings) {
    const items = warnings.slice(0, 3).map(w => `
        <div class="drift-item">
            <span>${escapeHTML(w.title)}</span>
            <span class="text-xs" style="color:var(--danger);">
                ${w.shortfall.toFixed(1)} ${w.unit} short
            </span>
        </div>
    `).join('');

    const extra = warnings.length > 3
        ? `<p class="text-xs text-muted" style="margin-top:6px;">+ ${warnings.length - 3} more</p>`
        : '';

    return `
    <div class="drift-banner">
        <div class="drift-title">⚠ Deadline Risk — ${warnings.length} task${warnings.length > 1 ? 's' : ''}</div>
        ${items}${extra}
        <p class="text-xs text-muted" style="margin-top:8px;">
            These tasks can't be completed by their deadline at current capacity.
            Consider extending deadlines or reducing scope in
            <a href="tasks.html" style="color:var(--accent);">Tasks</a>.
        </p>
    </div>`;
}

// ════════════════════════════════════════════════════════════
//  EMPTY / FREE DAY HTML
// ════════════════════════════════════════════════════════════
function emptyPlanHTML() {
    return `
    <div class="card free-day-card">
        <div class="free-icon">✦</div>
        <div class="free-title">Nothing scheduled today</div>
        <p class="text-sm text-muted">
            Add tasks with upcoming deadlines and ORACLE will fill your day automatically.
        </p>
        <a href="tasks.html" class="btn btn-primary btn-sm" style="margin-top:var(--gap-md);">
            Add Tasks
        </a>
    </div>`;
}

function freeDayHTML() {
    return `
    <div class="card free-day-card">
        <div class="free-icon">◎</div>
        <div class="free-title">Rest Day</div>
        <p class="text-sm text-muted">
            Today is one of your off days. No tasks scheduled — enjoy the break.
        </p>
        <a href="settings.html" class="text-xs text-muted" style="margin-top:var(--gap-md);display:block;">
            Change off days in Settings
        </a>
    </div>`;
}

// ════════════════════════════════════════════════════════════
//  TOGGLE ITEM (mark done / undone)
// ════════════════════════════════════════════════════════════
async function toggleItem(taskId, units) {
    const alreadyDone = (todayCompletions[taskId] ?? 0) >= units;
    const newUnits    = alreadyDone ? 0 : units;

    try {
        await logCompletion(currentUser.id, taskId, todayStr, newUnits);
        todayCompletions[taskId] = newUnits;

        // Update just this item's visual state without full re-render
        const btn = document.querySelector(`.item-checkbox[data-taskid="${taskId}"]`);
        if (!btn) return;

        const item = btn.closest('.schedule-item');
        if (newUnits > 0) {
            item.classList.add('done');
            btn.textContent = '✓';
            toast('Marked complete ✓', 'success', 1500);
        } else {
            item.classList.remove('done');
            btn.textContent = '';
            toast('Unmarked', 'info', 1500);
        }
    } catch (err) {
        toast('Error saving: ' + err.message, 'error');
    }
}

// ════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════
function escapeHTML(str) {
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Start ──
init();
