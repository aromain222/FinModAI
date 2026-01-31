/**
 * Model Storage
 * File storage utilities for financial models
 */

import { promises as fs } from 'fs';
import path from 'path';

// Storage directory (in /tmp for serverless, or local for development)
const STORAGE_DIR = process.env.MODEL_STORAGE_DIR || '/tmp/finmodai';

/**
 * Ensure storage directory exists
 */
async function ensureStorageDir(): Promise<void> {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  } catch (error) {
    console.error('[ensureStorageDir] Error:', error);
  }
}

/**
 * Get full file path for a model
 */
function getFilePath(modelId: string, extension: string = 'xlsx'): string {
  return path.join(STORAGE_DIR, `${modelId}.${extension}`);
}

/**
 * Read model file
 */
export async function readModelFile(modelId: string): Promise<Buffer | null> {
  try {
    const filePath = getFilePath(modelId);
    const buffer = await fs.readFile(filePath);
    return buffer;
  } catch (error) {
    console.error(`[readModelFile] Error reading ${modelId}:`, error);
    return null;
  }
}

/**
 * Write model file
 */
export async function writeModelFile(
  modelId: string,
  buffer: Buffer,
  extension: string = 'xlsx'
): Promise<boolean> {
  try {
    await ensureStorageDir();
    const filePath = getFilePath(modelId, extension);
    await fs.writeFile(filePath, buffer);
    return true;
  } catch (error) {
    console.error(`[writeModelFile] Error writing ${modelId}:`, error);
    return false;
  }
}

/**
 * Check if model file exists
 */
export async function modelFileExists(modelId: string): Promise<boolean> {
  try {
    const filePath = getFilePath(modelId);
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete model file
 */
export async function deleteModelFile(modelId: string): Promise<boolean> {
  try {
    const filePath = getFilePath(modelId);
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    console.error(`[deleteModelFile] Error deleting ${modelId}:`, error);
    return false;
  }
}

/**
 * Get download filename for a model
 */
export function getDownloadFilename(
  ticker: string,
  modelType: string,
  date?: Date
): string {
  const dateStr = date
    ? date.toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];
  
  const cleanTicker = ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanType = modelType.toLowerCase().replace(/[^a-z0-9]/g, '-');
  
  return `${cleanTicker}_${cleanType}_${dateStr}.xlsx`;
}

/**
 * Get file size
 */
export async function getFileSize(modelId: string): Promise<number | null> {
  try {
    const filePath = getFilePath(modelId);
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (error) {
    console.error(`[getFileSize] Error getting size for ${modelId}:`, error);
    return null;
  }
}

/**
 * List all model files
 */
export async function listModelFiles(): Promise<string[]> {
  try {
    await ensureStorageDir();
    const files = await fs.readdir(STORAGE_DIR);
    return files.filter(f => f.endsWith('.xlsx')).map(f => f.replace('.xlsx', ''));
  } catch (error) {
    console.error('[listModelFiles] Error:', error);
    return [];
  }
}

/**
 * Clean up old files (older than specified days)
 */
export async function cleanupOldFiles(daysOld: number = 7): Promise<number> {
  try {
    await ensureStorageDir();
    const files = await fs.readdir(STORAGE_DIR);
    const now = Date.now();
    const maxAge = daysOld * 24 * 60 * 60 * 1000;
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(STORAGE_DIR, file);
      const stats = await fs.stat(filePath);
      const age = now - stats.mtimeMs;
      
      if (age > maxAge) {
        await fs.unlink(filePath);
        deletedCount++;
      }
    }
    
    return deletedCount;
  } catch (error) {
    console.error('[cleanupOldFiles] Error:', error);
    return 0;
  }
}
