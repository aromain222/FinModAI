/**
 * Settings Storage Layer
 * 
 * Persists user settings. Supports Supabase (production) and file-based (dev) storage.
 */

import type { AppSettings } from './schema';
import { DEFAULT_SETTINGS, mergeWithDefaults } from './defaults';
import { AppSettingsSchema } from './schema';
import fs from 'fs';
import path from 'path';

/**
 * Get user settings
 * 
 * In production: fetch from Supabase user_settings table
 * In dev: read from .capitalbase-settings.json
 */
export async function getSettings(userId?: string): Promise<AppSettings> {
  // TODO: In production, fetch from Supabase
  // For now, use file-based storage in dev
  if (process.env.NODE_ENV === 'development' || !userId) {
    const settingsPath = path.join(process.cwd(), '.capitalbase-settings.json');
    
    if (fs.existsSync(settingsPath)) {
      try {
        const fileContent = fs.readFileSync(settingsPath, 'utf-8');
        const parsed = JSON.parse(fileContent);
        const validated = AppSettingsSchema.parse(parsed);
        return mergeWithDefaults(validated);
      } catch (error) {
        console.warn('[settings] Failed to load settings file, using defaults:', error);
        return DEFAULT_SETTINGS;
      }
    }
  }
  
  // TODO: Supabase implementation
  // const { data, error } = await supabase
  //   .from('user_settings')
  //   .select('settings')
  //   .eq('user_id', userId)
  //   .single();
  // if (error || !data) return DEFAULT_SETTINGS;
  // return mergeWithDefaults(data.settings);
  
  return DEFAULT_SETTINGS;
}

/**
 * Save user settings
 * 
 * In production: save to Supabase user_settings table
 * In dev: save to .capitalbase-settings.json
 */
export async function saveSettings(userId: string | undefined, settings: AppSettings): Promise<void> {
  // Validate settings
  const validated = AppSettingsSchema.parse(settings);
  
  // TODO: In production, save to Supabase
  // For now, use file-based storage in dev
  if (process.env.NODE_ENV === 'development' || !userId) {
    const settingsPath = path.join(process.cwd(), '.capitalbase-settings.json');
    
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(validated, null, 2), 'utf-8');
      return;
    } catch (error) {
      console.error('[settings] Failed to save settings file:', error);
      throw new Error('Failed to save settings');
    }
  }
  
  // TODO: Supabase implementation
  // const { error } = await supabase
  //   .from('user_settings')
  //   .upsert({
  //     user_id: userId,
  //     settings: validated,
  //     updated_at: new Date().toISOString(),
  //   });
  // if (error) throw new Error('Failed to save settings');
}

/**
 * Get settings for current user (server-side)
 * 
 * Extracts userId from request context or uses anonymous
 */
export async function getCurrentUserSettings(request?: Request): Promise<AppSettings> {
  // TODO: Extract userId from auth token/headers
  // For now, use anonymous/default
  const userId = undefined; // await getUserIdFromRequest(request);
  return getSettings(userId);
}
