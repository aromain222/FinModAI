/**
 * Settings Store
 * Manage user settings
 */

import { AppSettings, AppSettingsSchema, DEFAULT_SETTINGS } from './schema';

// In-memory settings store (in production, this would be in database/localStorage)
const settingsStore = new Map<string, AppSettings>();

/**
 * Get settings for a user
 */
export async function getSettings(userId?: string): Promise<AppSettings> {
  const key = userId || 'default';
  return settingsStore.get(key) || DEFAULT_SETTINGS;
}

/**
 * Save settings for a user
 */
export async function saveSettings(settings: Partial<AppSettings>, userId?: string): Promise<AppSettings> {
  const key = userId || 'default';
  const currentSettings = await getSettings(userId);
  
  // Merge and validate
  const newSettings = { ...currentSettings, ...settings };
  const validated = AppSettingsSchema.parse(newSettings);
  
  settingsStore.set(key, validated);
  return validated;
}

/**
 * Reset settings to defaults
 */
export async function resetSettings(userId?: string): Promise<AppSettings> {
  const key = userId || 'default';
  settingsStore.set(key, DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

/**
 * Get current user settings (convenience function)
 */
export async function getCurrentUserSettings(): Promise<AppSettings> {
  // In a real app, this would get the current user ID from auth context
  return getSettings();
}
