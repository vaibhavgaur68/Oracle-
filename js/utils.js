export function today() {
    return new Date().toISOString().split('T')[0];
}

// Convert a "YYYY-MM-DD" string to a JS Date object
export function parseDate(str) {
    // Adding T00:00:00 prevents timezone shift issues
    return new Date(str + 'T00:00:00');
}

// Format a "YYYY-MM-DD" string to a readable label e.g. "Mon, 12 May"
export function formatDate(str) {
    const d = parseDate(str);
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Format a "YYYY-MM-DD" string to just "12 May 2025"
export function formatDateLong(str) {
    const d = parseDate(str);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// How many days from today until a deadline date string
// Returns negative if overdue
export function daysUntil(deadlineStr) {
    const now  = new Date(); now.setHours(0,0,0,0);
    const dead = parseDate(deadlineStr);
    return Math.round((dead - now) / (1000 * 60 * 60 * 24));
}

// Returns a human-readable deadline label
// e.g. "Overdue by 3 days", "Due today", "3 days left"
export function deadlineLabel(deadlineStr) {
    const d = daysUntil(deadlineStr);
    if (d < 0)  return `Overdue by ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'}`;
    if (d === 0) return 'Due today';
    if (d === 1) return 'Due tomorrow';
    return `${d} days left`;
}

// Returns the colour class to use for a deadline label
export function deadlineClass(deadlineStr) {
    const d = daysUntil(deadlineStr);
    if (d < 0)  return 'text-danger';
    if (d <= 2) return 'text-warning';
    if (d <= 7) return 'text-accent';
    return 'text-muted';
}

// Add N days to a date string, returns new "YYYY-MM-DD" string
export function addDays(dateStr, n) {
    const d = parseDate(dateStr);
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
}

// Get an array of date strings between two dates (inclusive)
export function dateRange(fromStr, toStr) {
    const dates = [];
    let cur = fromStr;
    while (cur <= toStr) {
        dates.push(cur);
        cur = addDays(cur, 1);
    }
    return dates;
}

// Returns the day-of-week number (0=Sun, 1=Mon … 6=Sat) for a date string
export function dayOfWeek(dateStr) {
    return parseDate(dateStr).getDay();
}


// ════════════════════════════════════════════════════════════
//  TASK / PRIORITY HELPERS
// ════════════════════════════════════════════════════════════

// Convert a priority number (1-5) to a label
export function priorityLabel(p) {
    return ['', 'Low', 'Normal', 'Medium', 'High', 'Critical'][p] || 'Normal';
}

// Convert a priority number to its CSS badge class
export function priorityBadgeClass(p) {
    return `badge badge-p${p}`;
}

// Convert a category name to its CSS badge class
export function categoryBadgeClass(cat) {
    return `badge badge-${(cat || 'general').toLowerCase()}`;
}

// How complete is a task, as a 0-100 percentage
export function progressPercent(task) {
    if (!task.total_work || task.total_work === 0) return 0;
    return Math.min(100, Math.round((task.completed_work / task.total_work) * 100));
}

// Is a task fully complete?
export function isComplete(task) {
    return task.completed_work >= task.total_work;
}

// Remaining work on a task
export function remainingWork(task) {
    return Math.max(0, task.total_work - task.completed_work);
}

// Unit label — singular or plural e.g. "1 hour" / "3 hours"
export function unitLabel(amount, unit) {
    const u = unit || 'unit';
    if (amount === 1) return `1 ${u}`;
    // Simple pluralise: add 's' unless already ends in 's'
    const plural = u.endsWith('s') ? u : u + 's';
    return `${amount} ${plural}`;
}


// ════════════════════════════════════════════════════════════
//  COGNITIVE LOAD HELPERS
// ════════════════════════════════════════════════════════════

// Convert a CL ratio (0.0 – 1.0+) to a text label
export function clLabel(ratio) {
    if (ratio <= 0)    return 'Free';
    if (ratio <= 0.4)  return 'Light';
    if (ratio <= 0.7)  return 'Moderate';
    if (ratio <= 0.9)  return 'Busy';
    if (ratio <= 1.0)  return 'Full';
    return 'Overloaded';
}

// Convert a CL ratio to a CSS colour class
export function clClass(ratio) {
    if (ratio <= 0.5)  return 'success';
    if (ratio <= 0.85) return 'warning';
    return 'danger';
}

// Convert a CL ratio to a hex colour (for inline styles)
export function clColor(ratio) {
    if (ratio <= 0.5)  return 'var(--success)';
    if (ratio <= 0.85) return 'var(--warning)';
    return 'var(--danger)';
}


// ════════════════════════════════════════════════════════════
//  DOM HELPERS
// ════════════════════════════════════════════════════════════

// Shorthand for document.querySelector
export const $ = (sel, ctx = document) => ctx.querySelector(sel);

// Shorthand for document.querySelectorAll (returns array)
export const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// Show an element (remove 'hidden' class)
export function show(el) {
    if (typeof el === 'string') el = $(el);
    el?.classList.remove('hidden');
}

// Hide an element (add 'hidden' class)
export function hide(el) {
    if (typeof el === 'string') el = $(el);
    el?.classList.add('hidden');
}

// Set inner HTML of an element safely
export function setHTML(el, html) {
    if (typeof el === 'string') el = $(el);
    if (el) el.innerHTML = html;
}

// Set text content of an element
export function setText(el, text) {
    if (typeof el === 'string') el = $(el);
    if (el) el.textContent = text;
}

// Show a temporary toast notification at the bottom of the screen
// type: 'success' | 'error' | 'warning' | 'info'
export function toast(message, type = 'info', duration = 3000) {
    // Remove any existing toast
    document.querySelector('.oracle-toast')?.remove();

    const t = document.createElement('div');
    t.className = `oracle-toast alert alert-${type}`;
    t.style.cssText = `
        position: fixed;
        bottom: calc(var(--nav-bottom) + 16px);
        left: 50%;
        transform: translateX(-50%);
        z-index: 9999;
        white-space: nowrap;
        box-shadow: var(--shadow-lg);
        animation: fadeUp 0.2s ease;
        max-width: 90vw;
    `;
    t.textContent = message;
    document.body.appendChild(t);

    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transition = 'opacity 0.3s';
        setTimeout(() => t.remove(), 300);
    }, duration);
}

// Open a modal by ID
export function openModal(id) {
    const m = document.getElementById(id);
    m?.classList.add('open');
    document.body.style.overflow = 'hidden';
}

// Close a modal by ID
export function closeModal(id) {
    const m = document.getElementById(id);
    m?.classList.remove('open');
    document.body.style.overflow = '';
}

// Close modal when clicking the dark overlay behind it
export function bindModalClose(id) {
    const m = document.getElementById(id);
    m?.addEventListener('click', e => {
        if (e.target === m) closeModal(id);
    });
}


// ════════════════════════════════════════════════════════════
//  MISC
// ════════════════════════════════════════════════════════════

// Generate a consistent color from any string (for task color coding)
export function colorFromString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
        'var(--cat-study)',
        'var(--cat-work)',
        'var(--cat-personal)',
        'var(--accent)',
        'var(--warning)',
        'var(--success)',
    ];
    return colors[Math.abs(hash) % colors.length];
}

// Capitalize first letter of a string
export function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Clamp a number between min and max
export function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
}

// Round to N decimal places
export function round(val, decimals = 1) {
    return Math.round(val * 10 ** decimals) / 10 ** decimals;
}
