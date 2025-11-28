// Shared Supabase auth/session helper used by both pages
const SUPABASE_URL = 'https://afnpnivrlmckvwilspfh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmbnBuaXZybG1ja3Z3aWxzcGZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNDY2MDMsImV4cCI6MjA3ODYyMjYwM30.0bFGplQcP4zL6D-3QJIivpY8J1SFwkOIm-p-7Vfsvqg';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;

function defaultMapTask(row) {
  return {
    id: row.id,
    title: row.title || 'Untitled',
    category: row.category || 'personal',
    status: row.status || 'todo',
    dueDate: row.due_date || '',
    importance: row.importance || 3,
    urgency: row.urgency || 3
  };
}

async function getCurrentUserId() {
  if (currentUser?.id) return currentUser.id;
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    return user?.id || null;
  } catch (e) {
    return null;
  }
}

async function loadTasksForCurrentUser(mapper = defaultMapTask) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Missing user ID for task fetch');
  const { data, error } = await supabaseClient
    .from('tasks')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map(mapper);
}

async function initSupabaseAuth({ onSignedIn, onSignedOut } = {}) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    if (onSignedIn) await onSignedIn(currentUser);
  }

  supabaseClient.auth.onAuthStateChange(async (event, sessionPayload) => {
    if (event === 'SIGNED_OUT' || !sessionPayload?.user) {
      currentUser = null;
      if (onSignedOut) onSignedOut();
      return;
    }
    if (sessionPayload?.user) {
      currentUser = sessionPayload.user;
      if (onSignedIn) await onSignedIn(currentUser);
    }
  });
}

async function signOutCurrentUser() {
  return supabaseClient.auth.signOut();
}

export {
  supabaseClient,
  initSupabaseAuth,
  loadTasksForCurrentUser,
  signOutCurrentUser,
  getCurrentUserId,
  defaultMapTask
};
