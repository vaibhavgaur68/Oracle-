import { guardPage, logout }       from './auth.js';
import { getProfile, updateProfile } from './db.js';
import { toast, show, hide, $ }    from './utils.js';

// ── State ──
let currentUser = null;
let profile     = null;
let selectedOffDays = new Set(); // Set of day-of-week numbers (0=Sun … 6=Sat)

// ════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════
async function init() {
    currentUser = await guardPage();
    if (!currentUser) return;

    // Logout buttons
    document.getElementById('nav-logout')
        .addEventListener('click', e => { e.preventDefault(); logout(); });
    document.getElementById('logout-btn')
        .addEventListener('click', () => logout());

    // Capacity slider live update
    document.getElementById('capacity-slider')
        .addEventListener('input', e => {
            document.getElementById('capacity-val').textContent = e.target.value;
        });

    // Day pill toggle
    document.querySelectorAll('.day-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const dow = parseInt(pill.dataset.dow);
            if (selectedOffDays.has(dow)) {
                selectedOffDays.delete(dow);
                pill.classList.remove('selected');
            } else {
                selectedOffDays.add(dow);
                pill.classList.add('selected');
            }
        });
    });

    await loadSettings();
}

// ════════════════════════════════════════════════════════════
//  LOAD
// ════════════════════════════════════════════════════════════
async function loadSettings() {
    try {
        profile = await getProfile(currentUser.id);

        // Fill account info
        document.getElementById('s-name').textContent  =
            currentUser.user_metadata?.full_name || '—';
        document.getElementById('s-email').textContent =
            currentUser.email || '—';

        // Fill capacity slider
        const cap = profile.daily_capacity ?? 6;
        document.getElementById('capacity-slider').value = cap;
        document.getElementById('capacity-val').textContent = cap;

        // Fill off days
        selectedOffDays = new Set(profile.off_days ?? []);
        document.querySelectorAll('.day-pill').forEach(pill => {
            const dow = parseInt(pill.dataset.dow);
            if (selectedOffDays.has(dow)) pill.classList.add('selected');
        });

        // Fill default unit
        document.getElementById('default-unit').value =
            profile.default_unit ?? 'hours';

        // Show content, hide loading
        hide('#settings-loading');
        show('#settings-content');

    } catch (err) {
        document.getElementById('settings-loading').innerHTML =
            `<div class="alert alert-error">Failed to load settings: ${err.message}</div>`;
    }
}

// ════════════════════════════════════════════════════════════
//  SAVE
// ════════════════════════════════════════════════════════════
window.saveSettings = async function() {
    const btn = document.getElementById('save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
        const capacity    = parseFloat(document.getElementById('capacity-slider').value);
        const defaultUnit = document.getElementById('default-unit').value;
        const offDays     = [...selectedOffDays];

        await updateProfile(currentUser.id, {
            daily_capacity: capacity,
            default_unit:   defaultUnit,
            off_days:       offDays,
        });

        toast('Settings saved!', 'success');
    } catch (err) {
        toast('Error saving: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Settings';
    }
};

// ── Start ──
init();