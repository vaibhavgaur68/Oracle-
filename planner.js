// ============================================================
//  ORACLE — Planner Page (planner.js)
//  Shows the engine's full multi-week schedule.
//  Week-by-week navigation, tap a day to expand its tasks.
// ============================================================

import { guardPage, logout }          from './auth.js';
import { getEngineData }              from './db.js';
import { runEngine }                  from './matrix-engine.js';
import { today, addDays, formatDate,
         unitLabel, clColor, clLabel,
         toast, setHTML }             from './utils.js';

// ── State ──
let currentUser  = null;
let schedule     = {};       // from engine output
let weekOffset   = 0;        // 0 = current week, 1 = next week, etc.
const todayStr   = today();

// ════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════
async function init() {
    currentUser = await guardPage();
    if (!currentUser) return;

    document.getElementById('nav-logout')
        .addEventListener('click', e => { e.preventDefault(); logout(); });

    document.getElementById('prev-week')
        .addEventListener('click', () => { weekOffset--; renderWeek(); });

    document.getElementById('next-week')
        .addEventListener('click', () => { weekOffset++; renderWeek(); });

    await loadSchedule();
}

// ════════════════════════════════════════════════════════════
//  LOAD — run engine and store schedule
// ════════════════════════════════════════════════════════════
async function loadSchedule() {
    try {
        const { tasks, completions, profile } = await getEngineData(currentUser.id);
        const output = runEngine(tasks, completions, profile);
        schedule = output.schedule;
        renderWeek();
    } catch (err) {
        setHTML('#day-grid', `<div class="alert alert-error">Failed to load: ${err.message}</div>`);
    }
}

// ════════════════════════════════════════════════════════════
//  RENDER WEEK
// ════════════════════════════════════════════════════════════
function renderWeek() {
    // Find the Monday of the current week + offset
    const weekStart = getWeekStart(weekOffset);
    const weekEnd   = addDays(weekStart, 6);

    // Week label
    document.getElementById('week-label').textContent =
        `${formatDate(weekStart)} — ${formatDate(weekEnd)}`;

    // Disable prev button if we're already on current week
    document.getElementById('prev-week').disabled = weekOffset <= 0;

    // Build 7 day rows
    const rows = [];
    for (let i = 0; i < 7; i++) {
        const dateStr = addDays(weekStart, i);
        const dayData = schedule[dateStr];
        rows.push(dayRowHTML(dateStr, dayData));
    }

    setHTML('#day-grid', `<div class="day-grid">${rows.join('')}</div>`);

    // Bind expand/collapse on each day header
    document.querySelectorAll('.day-header').forEach(header => {
        header.addEventListener('click', () => {
            const row = header.closest('.day-row');
            row.classList.toggle('expanded');
        });
    });

    // Auto-expand today
    const todayRow = document.querySelector(`.day-row[data-date="${todayStr}"]`);
    if (todayRow) todayRow.classList.add('expanded');
}

// ════════════════════════════════════════════════════════════
//  DAY ROW HTML
// ════════════════════════════════════════════════════════════
function dayRowHTML(dateStr, dayData) {
    const isToday  = dateStr === todayStr;
    const isOff    = dayData?.isOff ?? false;
    const isPast   = dateStr < todayStr;

    const clRatio  = dayData?.clRatio ?? 0;
    const clPct    = Math.min(100, Math.round(clRatio * 100));
    const col      = clColor(clRatio);
    const label    = clLabel(clRatio);

    // Day name e.g. "Mon"
    const d        = new Date(dateStr + 'T00:00:00');
    const dayName  = d.toLocaleDateString('en-GB', { weekday: 'short' });
    const dayNum   = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    const classes  = [
        'day-row',
        isToday ? 'is-today' : '',
        isOff   ? 'is-off'   : '',
        isPast && !isToday ? 'is-past' : '',
    ].filter(Boolean).join(' ');

    // Body content
    let bodyHTML = '';
    if (isOff) {
        bodyHTML = `<div class="day-off-msg">Rest day — no tasks scheduled.</div>`;
    } else if (!dayData || dayData.items.length === 0) {
        bodyHTML = `<div class="day-empty-msg">Nothing scheduled.</div>`;
    } else {
        bodyHTML = dayData.items.map(item => plannerItemHTML(item)).join('');
    }

    return `
    <div class="${classes}" data-date="${dateStr}">
        <div class="day-header">
            <div class="day-label">
                <div class="day-name">${isToday ? 'Today' : dayName}</div>
                <div class="day-date-num">${dayNum}</div>
            </div>

            ${isOff
                ? `<span class="text-xs text-muted" style="flex:1;">Day off</span>`
                : `<div class="day-cl-wrap">
                        <div class="day-cl-bar">
                            <div class="day-cl-fill" style="width:${clPct}%;background:${col};"></div>
                        </div>
                        <div class="day-cl-text">${label} · ${clPct}%</div>
                   </div>`
            }

            <span class="day-chevron">▼</span>
        </div>

        <div class="day-body">
            ${bodyHTML}
        </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════
//  PLANNER ITEM HTML
// ════════════════════════════════════════════════════════════
function plannerItemHTML(item) {
    const dotColors = {
        BREACH:   'var(--danger)',
        SPRINT:   'var(--warning)',
        MARATHON: 'var(--success)',
    };
    const dotColor  = dotColors[item.strategy] || 'var(--accent)';
    const unitsText = unitLabel(item.units, item.unit);

    return `
    <div class="planner-item">
        <div class="planner-item-dot" style="background:${dotColor};"></div>
        <span class="planner-item-title">${escapeHTML(item.title)}</span>
        <span class="planner-item-units">${unitsText}</span>
    </div>`;
}

// ════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════

// Get the Monday of the week at a given offset from today's week
function getWeekStart(offset) {
    const d = new Date(todayStr + 'T00:00:00');
    // Move to Monday (0=Sun → go back 6, 1=Mon → 0, etc.)
    const day = d.getDay();
    const diff = (day === 0) ? -6 : 1 - day;
    d.setDate(d.getDate() + diff + offset * 7);
    return d.toISOString().split('T')[0];
}

function escapeHTML(str) {
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Start ──
init();