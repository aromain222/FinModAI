/**
 * Model Storage Utilities
 * 
 * Handles saving and retrieving Excel files from disk and Supabase
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import type { ModelType } from '@/types/models';

const STORAGE_DIR = '/tmp/capitalbase';

/**
 * Ensure storage directory exists
 */
export function ensureStorageDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

/**
 * Get file path for a model
 */
export function getModelFilePath(modelId: string): string {
  return path.join(STORAGE_DIR, `${modelId}.xlsx`);
}

/**
 * Save Excel buffer to disk
 */
export async function saveModelFile(modelId: string, buffer: Buffer): Promise<string> {
  ensureStorageDir();
  const filePath = getModelFilePath(modelId);
  
  await fs.promises.writeFile(filePath, buffer);
  
  return filePath;
}

/**
 * Check if model file exists
 */
export function modelFileExists(modelId: string): boolean {
  const filePath = getModelFilePath(modelId);
  return fs.existsSync(filePath);
}

/**
 * Read model file from disk
 */
export async function readModelFile(modelId: string): Promise<Buffer> {
  const filePath = getModelFilePath(modelId);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Model file not found: ${modelId}`);
  }
  
  return fs.promises.readFile(filePath);
}

/**
 * Save model metadata to Supabase
 */
export async function saveModelMetadata(
  modelId: string,
  ticker: string,
  modelType: ModelType,
  filePath: string
): Promise<void> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.warn('Supabase credentials not found, skipping metadata save');
      return;
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { error } = await supabase
      .from('models')
      .insert({
        id: modelId,
        ticker: ticker.toUpperCase(),
        model_type: modelType,
        type: modelType, // For backwards compatibility
        path: filePath,
        status: 'completed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    
    if (error) {
      console.error('Failed to save model metadata to Supabase:', error);
      // Don't throw - file generation succeeded even if DB insert failed
    }
  } catch (err) {
    console.error('Error saving model metadata:', err);
    // Don't throw - file generation succeeded even if DB insert failed
  }
}

/**
 * Generate filename for download
 */
export function getDownloadFilename(ticker: string, modelType: ModelType): string {
  const timestamp = new Date().toISOString().split('T')[0];
  return `${ticker}_${modelType}_${timestamp}.xlsx`;
}

