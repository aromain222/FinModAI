/**
 * Models Repository
 * Database operations for financial models using Supabase
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export interface ModelRecord {
  id: string;
  user_id?: string;
  ticker: string;
  model_type:
    | 'dcf'
    | 'lbo'
    | 'comps'
    | 'merger'
    | 'operating'
    | 'three-statement'
    | 'scorecard';
  status: 'pending' | 'generating' | 'ready' | 'error' | 'failed';
  file_name?: string;
  r2_key?: string;
  assumptions?: Record<string, any>;
  results?: Record<string, any>;
  notes?: string;
  created_at: string;
  updated_at: string;
  scenario?: string;
  error?: string;
}

/**
 * Count total models
 */
export async function countModels(userId?: string): Promise<number> {
  if (!supabase) {
    console.warn('[modelsRepo] Supabase not configured');
    return 0;
  }
  
  try {
    let query = supabase.from('models').select('id', { count: 'exact', head: true });
    
    if (userId) {
      query = query.eq('user_id', userId);
    }
    
    const { count, error } = await query;
    
    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('[countModels] Error:', error);
    return 0;
  }
}

/**
 * Get recent models
 */
export async function getRecentModels(limit: number = 10, userId?: string): Promise<ModelRecord[]> {
  if (!supabase) {
    console.warn('[modelsRepo] Supabase not configured');
    return [];
  }
  
  try {
    let query = supabase
      .from('models')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (userId) {
      query = query.eq('user_id', userId);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return (data as ModelRecord[]) || [];
  } catch (error) {
    console.error('[getRecentModels] Error:', error);
    return [];
  }
}

/**
 * Insert a new model
 */
export async function insertModel(model: Omit<ModelRecord, 'id' | 'created_at' | 'updated_at'>): Promise<ModelRecord | null> {
  if (!supabase) {
    console.warn('[modelsRepo] Supabase not configured');
    return null;
  }
  
  try {
    const { data, error } = await supabase
      .from('models')
      .insert([model])
      .select()
      .single();
    
    if (error) throw error;
    return data as ModelRecord;
  } catch (error) {
    console.error('[insertModel] Error:', error);
    return null;
  }
}

/**
 * Update model notes
 */
export async function updateModelNotes(modelId: string, notes: string): Promise<boolean> {
  if (!supabase) {
    console.warn('[modelsRepo] Supabase not configured');
    return false;
  }
  
  try {
    const { error } = await supabase
      .from('models')
      .update({ notes, updated_at: new Date().toISOString() })
      .eq('id', modelId);
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('[updateModelNotes] Error:', error);
    return false;
  }
}

/**
 * Get model by ID
 */
export async function getModelById(modelId: string): Promise<ModelRecord | null> {
  if (!supabase) {
    console.warn('[modelsRepo] Supabase not configured');
    return null;
  }
  
  try {
    const { data, error } = await supabase
      .from('models')
      .select('*')
      .eq('id', modelId)
      .single();
    
    if (error) throw error;
    return data as ModelRecord;
  } catch (error) {
    console.error('[getModelById] Error:', error);
    return null;
  }
}

/**
 * Update model status
 */
export async function updateModelStatus(
  modelId: string,
  status: ModelRecord['status'],
  error?: string
): Promise<boolean> {
  if (!supabase) {
    console.warn('[modelsRepo] Supabase not configured');
    return false;
  }
  
  try {
    const updates: Partial<ModelRecord> = {
      status,
      updated_at: new Date().toISOString()
    };
    
    if (error) {
      updates.error = error;
    }
    
    const { error: updateError } = await supabase
      .from('models')
      .update(updates)
      .eq('id', modelId);
    
    if (updateError) throw updateError;
    return true;
  } catch (err) {
    console.error('[updateModelStatus] Error:', err);
    return false;
  }
}

/**
 * Delete model
 */
export async function deleteModel(modelId: string): Promise<boolean> {
  if (!supabase) {
    console.warn('[modelsRepo] Supabase not configured');
    return false;
  }
  
  try {
    const { error } = await supabase
      .from('models')
      .delete()
      .eq('id', modelId);
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('[deleteModel] Error:', error);
    return false;
  }
}

/**
 * List all models
 */
export async function listAllModels(userId?: string): Promise<ModelRecord[]> {
  return getRecentModels(100, userId);
}
