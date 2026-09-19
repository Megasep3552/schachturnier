import { createClient } from '@supabase/supabase-js';

import type { EntityId, Spieler } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY müssen gesetzt sein.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function fetchRows<T>(table: string): Promise<T[]> {
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw new Error(`Fehler beim Laden von ${table}: ${error.message}`);
  return (data ?? []) as T[];
}

export async function insertRows<T>(table: string, rows: object[]): Promise<T[]> {
  const { data, error } = await supabase.from(table).insert(rows).select();
  if (error) {
    console.error(`Fehler beim Speichern in ${table}:`, error);
    throw new Error(`Fehler beim Speichern in ${table}: ${error.message}`);
  }
  return (data ?? []) as T[];
}

export async function insertSpieler(spieler: Omit<Spieler, 'id'>): Promise<Spieler> {
  const payload = {
    name: spieler.name.trim(),
    gruppe: spieler.gruppe,
    dwz: spieler.dwz ?? null,
    punkte: spieler.punkte ?? 0,
    buchholz: spieler.buchholz ?? 0,
    anwesend: spieler.anwesend ?? true,
  };
  const { data, error } = await supabase.from('spieler').insert([payload]).select().single();
  if (error) {
    console.error('Fehler beim Anlegen des Spielers:', JSON.stringify(error, null, 2), error?.message, error?.details);
    const errorCode = error.code;
    const errorStatus = 'status' in error && typeof error.status === 'number' ? error.status : undefined;
    if (errorCode === '42501' || errorCode === '401' || errorStatus === 401 || error.message.includes('401')) {
      throw new Error("RLS Policy in Supabase blockiert das Einfügen in 'spieler'");
    }
    throw new Error(`Fehler beim Anlegen des Spielers: ${error.message}`);
  }
  return data as Spieler;
}

export async function upsertRows<T>(table: string, rows: object[]): Promise<T[]> {
  const { data, error } = await supabase.from(table).upsert(rows).select();
  if (error) throw new Error(`Fehler beim Import in ${table}: ${error.message}`);
  return (data ?? []) as T[];
}

export async function updateRow<T>(table: string, values: Partial<T>, id: EntityId): Promise<void> {
  const { error } = await supabase.from(table).update(values as never).eq('id', id);
  if (error) throw new Error(`Fehler beim Aktualisieren von ${table}: ${error.message}`);
}

export async function deleteAllRows(table: string): Promise<void> {
  const { error } = await supabase.from(table).delete().neq('runde', 0);
  if (error) throw new Error(`Fehler beim Löschen aus ${table}: ${error.message}`);
}

export async function deleteRow(table: string, id: EntityId): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw new Error(`Fehler beim Löschen aus ${table}: ${error.message}`);
}
