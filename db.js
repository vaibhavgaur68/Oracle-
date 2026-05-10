import { supabase } from './supabase-client.js';


// ════════════════════════════════════════════════════════════
//  PROFILE
// ════════════════════════════════════════════════════════════

// Get the logged-in user's profile (settings)
export async function getProfile(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error) throw error;
    return data;
}

// Update profile settings (daily capacity, off days, etc.)
export async function updateProfile(userId, updates) {
    const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

    if (error) throw error;
    return data;
}


// ════════════════════════════════════════════════════════════
//  TASKS — Create / Read / Update / Delete
// ════════════════════════════════════════════════════════════

// Get ALL active (non-archived) tasks for a user
export async function getTasks(userId) {
    const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .eq('is_archived', false)
        .order('deadline', { ascending: true });

    if (error) throw error;
    return data || [];
}

// Get a single task by its ID
export async function getTask(taskId) {
    const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();

    if (error) throw error;
    return data;
}

// Create a brand new task
// taskData should have: title, category, unit, total_work, deadline, priority, notes
export async function createTask(userId, taskData) {
    const { data, error } = await supabase
        .from('tasks')
        .insert({ ...taskData, user_id: userId })
        .select()
        .single();

    if (error) throw error;
    return data;
}

// Edit an existing task (pass only the fields you want to change)
export async function updateTask(taskId, updates) {
    const { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', taskId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// Soft-delete a task (hides it, doesn't actually remove it)
export async function archiveTask(taskId) {
    return updateTask(taskId, { is_archived: true });
}

// Permanently delete a task
export async function deleteTask(taskId) {
    const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);

    if (error) throw error;
}

// Update how many units have been completed on a task
// This is called whenever the user logs work on the dashboard
export async function updateTaskProgress(taskId, completedWork) {
    return updateTask(taskId, { completed_work: completedWork });
}


// ════════════════════════════════════════════════════════════
//  COMPLETIONS — Daily work log
// ════════════════════════════════════════════════════════════

// Log that a user completed some units on a task today
// If an entry already exists for today, it UPDATES it instead of creating a duplicate
export async function logCompletion(userId, taskId, date, unitsDone) {
    const { data, error } = await supabase
        .from('completions')
        .upsert(
            { user_id: userId, task_id: taskId, date, units_done: unitsDone },
            { onConflict: 'user_id,task_id,date' }
        )
        .select()
        .single();

    if (error) throw error;

    // Also update the task's total completed_work
    // Fetch all completions for this task and sum them up
    const total = await getTotalCompletedForTask(taskId);
    await updateTaskProgress(taskId, total);

    return data;
}

// Get all completions for a user in a date range
// Used by the MatrixEngine to know what's already been done
export async function getCompletions(userId, fromDate, toDate) {
    const { data, error } = await supabase
        .from('completions')
        .select('*')
        .eq('user_id', userId)
        .gte('date', fromDate)
        .lte('date', toDate)
        .order('date', { ascending: true });

    if (error) throw error;
    return data || [];
}

// Get completions for a specific single day
export async function getCompletionsForDay(userId, date) {
    return getCompletions(userId, date, date);
}

// Get the total completed units across all time for one task
async function getTotalCompletedForTask(taskId) {
    const { data, error } = await supabase
        .from('completions')
        .select('units_done')
        .eq('task_id', taskId);

    if (error) throw error;
    const total = (data || []).reduce((sum, row) => sum + row.units_done, 0);
    return total;
}

// Delete a completion entry (undo a logged session)
export async function deleteCompletion(completionId) {
    const { error } = await supabase
        .from('completions')
        .delete()
        .eq('id', completionId);

    if (error) throw error;
}


// ════════════════════════════════════════════════════════════
//  HELPERS — Convenience functions used across pages
// ════════════════════════════════════════════════════════════

// Returns all data the MatrixEngine needs in one call:
// tasks, completions for the next 90 days, and the user's profile
export async function getEngineData(userId) {
    const today = toDateString(new Date());
    const future = toDateString(addDays(new Date(), 90));

    const [tasks, completions, profile] = await Promise.all([
        getTasks(userId),
        getCompletions(userId, today, future),
        getProfile(userId)
    ]);

    return { tasks, completions, profile };
}

// Formats a JS Date object to "YYYY-MM-DD" string for Supabase
export function toDateString(date) {
    return date.toISOString().split('T')[0];
}

// Add N days to a date, returns a new Date object
export function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
}