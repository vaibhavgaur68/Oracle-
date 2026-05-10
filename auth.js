import { supabase } from './supabase-client.js';

// ────────────────────────────────────────────────────────────
//  SIGN UP — creates a new account
// ────────────────────────────────────────────────────────────
export async function signUp(fullName, email, password) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { full_name: fullName }
        }
    });

    if (error) throw error;
    return data;
}

// ────────────────────────────────────────────────────────────
//  LOGIN — signs into an existing account
// ────────────────────────────────────────────────────────────
export async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) throw error;
    return data;
}

// ────────────────────────────────────────────────────────────
//  LOGOUT — signs out and goes back to login page
// ────────────────────────────────────────────────────────────
export async function logout() {
    await supabase.auth.signOut();
    window.location.href = '/index.html';
}

// ────────────────────────────────────────────────────────────
//  GET CURRENT USER — returns the logged-in user or null
// ────────────────────────────────────────────────────────────
export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

// ────────────────────────────────────────────────────────────
//  GUARD PAGE
//  Call this at the top of every page except index.html.
//  If the user is not logged in, it sends them to login page.
//  Returns the user object if they ARE logged in.
// ────────────────────────────────────────────────────────────
export async function guardPage() {
    const user = await getCurrentUser();
    if (!user) {
        window.location.href = '/index.html';
        return null;
    }
    return user;
}