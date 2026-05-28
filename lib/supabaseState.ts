import { createClient, type SupabaseClient } from '@supabase/supabase-js';

declare const process: {
  env: Record<string, string | undefined>;
};

const DEFAULT_SCHEMA_NAME = 'clipwise';
const TABLE_NAME = 'app_state';

interface AppStateRow {
  id: string;
  data: unknown;
  saved_at: number;
  updated_at?: string;
}

let client: SupabaseClient | null = null;

function getSupabase() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  }

  client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return client;
}

export function getStateId() {
  return process.env.SUPABASE_APP_STATE_ID || 'primary';
}

function getSchemaName() {
  return process.env.SUPABASE_SCHEMA || DEFAULT_SCHEMA_NAME;
}

export async function loadAppState() {
  const { data, error } = await getSupabase()
    .schema(getSchemaName())
    .from(TABLE_NAME)
    .select('id,data,saved_at,updated_at')
    .eq('id', getStateId())
    .maybeSingle<AppStateRow>();

  if (error) throw new Error(error.message);
  return data;
}

export async function saveAppState(data: unknown, savedAt: number) {
  const row: AppStateRow = {
    id: getStateId(),
    data,
    saved_at: savedAt,
  };

  const { data: saved, error } = await getSupabase()
    .schema(getSchemaName())
    .from(TABLE_NAME)
    .upsert(row, { onConflict: 'id' })
    .select('id,data,saved_at,updated_at')
    .single<AppStateRow>();

  if (error) throw new Error(error.message);
  return saved;
}
