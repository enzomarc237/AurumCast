import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

let supabase: SupabaseClient;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  console.warn("Supabase credentials missing. Authentication features will be disabled.");
  // Create a minimal mock client to prevent runtime crashes in components
  supabase = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ 
        data: { subscription: { unsubscribe: () => {} } } 
      }),
      signUp: () => Promise.resolve({ 
        data: null, 
        error: { message: "Supabase credentials are not configured in this environment." } 
      }),
      signInWithPassword: () => Promise.resolve({ 
        data: null, 
        error: { message: "Supabase credentials are not configured in this environment." } 
      }),
      signOut: () => Promise.resolve({ error: null }),
      updateUser: () => Promise.resolve({ 
        data: null, 
        error: { message: "Supabase credentials are not configured." } 
      }),
    }
  } as unknown as SupabaseClient;
}

export { supabase };