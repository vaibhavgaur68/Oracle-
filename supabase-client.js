import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ────────────────────────────────────────────────────────────
//  REPLACE THESE TWO VALUES with your own from:
//  Supabase Dashboard → Project Settings → API
// ────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://xtvwlcqdkvtplrjgvkgw.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0dndsY3Fka3Z0cGxyamd2a2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzU3NDgsImV4cCI6MjA5MzkxMTc0OH0.Mlqt516wgXmkb2PnTiP5hqmvyfFLRNrbf7IrkSeLnDY';
// ────────────────────────────────────────────────────────────

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);