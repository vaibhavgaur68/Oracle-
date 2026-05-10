import { today, addDays, daysUntil, dayOfWeek } from './utils.js';


// ════════════════════════════════════════════════════════════
//  MAIN ENTRY POINT
//  Call this with data from db.getEngineData()
//  Returns a schedule object you can use in any page
// ════════════════════════════════════════════════════════════

export function runEngine(tasks, completions, profile) {

    // ── 1. Read user settings ──
    const dailyCapacity = profile?.daily_capacity ?? 6;   // hours per day
    const offDays       = profile?.off_days ?? [];         // e.g. [0, 6] = Sun & Sat

    // ── 2. Build completion map: { "taskId|date": unitsDone } ──
    const completionMap = buildCompletionMap(completions);

    // ── 3. Filter out fully complete or archived tasks ──
    const activeTasks = tasks.filter(t =>
        !t.is_archived &&
        remaining(t, completionMap) > 0
    );

    // ── 4. Find how far ahead we need to plan
    //       (up to the furthest deadline, max 90 days) ──
    const planDays = getPlanWindow(activeTasks);

    // ── 5. Build the day slots array
    //       Each slot = { date, capacity, load, scheduled: [] } ──
    const slots = buildSlots(planDays, dailyCapacity, offDays);

    // ── 6. Separate tasks into three strategy buckets ──
    const todayStr  = today();
    const breach    = [];
    const sprint    = [];
    const marathon  = [];

    for (const task of activeTasks) {
        const d = daysUntil(task.deadline);
        if (d < 0)      breach.push(task);
        else if (d <= 7) sprint.push(task);
        else             marathon.push(task);
    }

    // ── 7. Schedule each bucket ──
    scheduleBreach(breach,   slots, completionMap, todayStr);
    scheduleSprint(sprint,   slots, completionMap, todayStr);
    scheduleMarathon(marathon, slots, completionMap, todayStr);

    // ── 8. Build the final output object ──
    return buildOutput(slots, activeTasks, completionMap, todayStr, dailyCapacity);
}


// ════════════════════════════════════════════════════════════
//  STEP 2 — Completion Map
//  Flat lookup: "taskId|YYYY-MM-DD" → units done that day
// ════════════════════════════════════════════════════════════

function buildCompletionMap(completions) {
    const map = {};
    for (const c of completions) {
        map[`${c.task_id}|${c.date}`] = c.units_done;
    }
    return map;
}

// How many units are still remaining for a task
function remaining(task, completionMap) {
    return Math.max(0, task.total_work - task.completed_work);
}

// How many units were done on a specific task on a specific date
function doneOnDay(taskId, dateStr, completionMap) {
    return completionMap[`${taskId}|${dateStr}`] ?? 0;
}


// ════════════════════════════════════════════════════════════
//  STEP 4 — Plan Window
//  How many days ahead to build the schedule
// ════════════════════════════════════════════════════════════

function getPlanWindow(activeTasks) {
    if (activeTasks.length === 0) return 30;
    const todayStr = today();
    let maxDays = 14; // minimum window
    for (const t of activeTasks) {
        const d = daysUntil(t.deadline);
        if (d > maxDays) maxDays = d;
    }
    return Math.min(maxDays + 7, 90); // buffer of 7 days, cap at 90
}


// ════════════════════════════════════════════════════════════
//  STEP 5 — Build Day Slots
// ════════════════════════════════════════════════════════════

function buildSlots(planDays, dailyCapacity, offDays) {
    const slots = [];
    const todayStr = today();

    for (let i = 0; i < planDays; i++) {
        const dateStr = addDays(todayStr, i);
        const dow     = dayOfWeek(dateStr);
        const isOff   = offDays.includes(dow);

        slots.push({
            date:      dateStr,
            isOff,
            capacity:  isOff ? 0 : dailyCapacity,  // off days have 0 capacity
            load:      0,                            // fills up as tasks are scheduled
            scheduled: []                            // { task, units }
        });
    }

    return slots;
}

// How much space is left in a slot
function slotSpace(slot) {
    return Math.max(0, slot.capacity - slot.load);
}


// ════════════════════════════════════════════════════════════
//  STEP 6a — BREACH Strategy
//  Overdue tasks — fill up today first, then tomorrow, etc.
//  Sort by how overdue they are (most overdue = most urgent)
// ════════════════════════════════════════════════════════════

function scheduleBreach(tasks, slots, completionMap) {
    // Most overdue first
    tasks.sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline));

    for (const task of tasks) {
        let rem = remaining(task, completionMap);

        for (const slot of slots) {
            if (rem <= 0) break;
            if (slot.isOff) continue;

            const space = slotSpace(slot);
            if (space <= 0) continue;

            const assign = Math.min(rem, space);
            slot.scheduled.push({ task, units: assign, strategy: 'BREACH' });
            slot.load += assign;
            rem -= assign;
        }
    }
}


// ════════════════════════════════════════════════════════════
//  STEP 6b — SPRINT Strategy
//  Deadline within 7 days — sort by nearest deadline + priority
//  Fill from today forward aggressively
// ════════════════════════════════════════════════════════════

function scheduleSprint(tasks, slots, completionMap) {
    // Nearest deadline first; on tie, higher priority first
    tasks.sort((a, b) => {
        const dA = daysUntil(a.deadline);
        const dB = daysUntil(b.deadline);
        if (dA !== dB) return dA - dB;
        return b.priority - a.priority;
    });

    for (const task of tasks) {
        let rem = remaining(task, completionMap);

        // Only schedule up to the deadline slot
        const deadlineStr = task.deadline;

        for (const slot of slots) {
            if (rem <= 0) break;
            if (slot.isOff) continue;
            if (slot.date > deadlineStr) break; // don't go past deadline

            const space = slotSpace(slot);
            if (space <= 0) continue;

            const assign = Math.min(rem, space);
            slot.scheduled.push({ task, units: assign, strategy: 'SPRINT' });
            slot.load += assign;
            rem -= assign;
        }
    }
}


// ════════════════════════════════════════════════════════════
//  STEP 6c — MARATHON Strategy
//  Relaxed tasks — spread evenly across available days
//  High priority tasks get a slight front-load bias
// ════════════════════════════════════════════════════════════

function scheduleMarathon(tasks, slots, completionMap) {
    // Sort by deadline first, then priority
    tasks.sort((a, b) => {
        const dA = daysUntil(a.deadline);
        const dB = daysUntil(b.deadline);
        if (dA !== dB) return dA - dB;
        return b.priority - a.priority;
    });

    for (const task of tasks) {
        let rem = remaining(task, completionMap);
        if (rem <= 0) continue;

        const deadlineStr = task.deadline;

        // Count available work days before deadline
        const workDays = slots.filter(s =>
            !s.isOff && s.date <= deadlineStr
        );

        if (workDays.length === 0) continue;

        // Daily target = spread remaining work across available days
        // High priority (4-5): front-load by 1.3x on early days
        const isFrontLoaded = task.priority >= 4;
        const dailyTarget   = rem / workDays.length;

        for (const slot of slots) {
            if (rem <= 0) break;
            if (slot.isOff) continue;
            if (slot.date > deadlineStr) break;

            const space = slotSpace(slot);
            if (space <= 0) continue;

            // Front-load: assign more in first half of the window
            const halfwayDay = Math.floor(workDays.length / 2);
            const slotIndex  = workDays.indexOf(slot);
            const multiplier = (isFrontLoaded && slotIndex < halfwayDay) ? 1.3 : 1.0;
            const target     = Math.min(dailyTarget * multiplier, rem);

            const assign = Math.min(target, space);
            if (assign < 0.01) continue; // skip negligible amounts

            slot.scheduled.push({ task, units: round2(assign), strategy: 'MARATHON' });
            slot.load += assign;
            rem -= assign;
        }
    }
}


// ════════════════════════════════════════════════════════════
//  STEP 8 — Build Output
//  Turns the raw slots into a clean, usable object
// ════════════════════════════════════════════════════════════

function buildOutput(slots, activeTasks, completionMap, todayStr, dailyCapacity) {

    // Build per-day schedule (only days that have work)
    const schedule = {};
    for (const slot of slots) {
        if (slot.scheduled.length === 0 && !slot.isOff) continue;

        schedule[slot.date] = {
            date:      slot.date,
            isOff:     slot.isOff,
            capacity:  slot.capacity,
            load:      round2(slot.load),
            clRatio:   slot.capacity > 0 ? round2(slot.load / slot.capacity) : 0,
            items:     slot.scheduled.map(s => ({
                taskId:   s.task.id,
                title:    s.task.title,
                category: s.task.category,
                priority: s.task.priority,
                unit:     s.task.unit,
                units:    round2(s.units),
                strategy: s.strategy,
                deadline: s.task.deadline,
            }))
        };
    }

    // Today's plan
    const todayPlan = schedule[todayStr] ?? {
        date: todayStr, isOff: false,
        capacity: dailyCapacity, load: 0, clRatio: 0, items: []
    };

    // Drift detection — tasks that won't finish by deadline at current pace
    const driftWarnings = detectDrift(activeTasks, slots, completionMap);

    // Summary stats
    const stats = {
        totalActiveTasks: activeTasks.length,
        overdueCount:     activeTasks.filter(t => daysUntil(t.deadline) < 0).length,
        sprintCount:      activeTasks.filter(t => { const d = daysUntil(t.deadline); return d >= 0 && d <= 7; }).length,
        marathonCount:    activeTasks.filter(t => daysUntil(t.deadline) > 7).length,
        todayLoad:        todayPlan.load,
        todayCapacity:    dailyCapacity,
        todayCLRatio:     todayPlan.clRatio,
    };

    return { schedule, todayPlan, driftWarnings, stats };
}


// ════════════════════════════════════════════════════════════
//  DRIFT DETECTION
//  Find tasks that will NOT be finished before their deadline
//  at the rate they're currently scheduled
// ════════════════════════════════════════════════════════════

function detectDrift(tasks, slots, completionMap) {
    const warnings = [];

    for (const task of tasks) {
        const deadlineStr = task.deadline;
        let scheduledTotal = 0;

        for (const slot of slots) {
            if (slot.date > deadlineStr) break;
            for (const s of slot.scheduled) {
                if (s.task.id === task.id) scheduledTotal += s.units;
            }
        }

        const rem = remaining(task, completionMap);
        if (scheduledTotal < rem * 0.95) { // 5% tolerance for rounding
            warnings.push({
                taskId:    task.id,
                title:     task.title,
                deadline:  task.deadline,
                remaining: round2(rem),
                scheduled: round2(scheduledTotal),
                shortfall: round2(rem - scheduledTotal),
                unit:      task.unit,
            });
        }
    }

    return warnings;
}


// ════════════════════════════════════════════════════════════
//  TINY HELPERS (internal only)
// ════════════════════════════════════════════════════════════

function round2(n) {
    return Math.round(n * 100) / 100;
}