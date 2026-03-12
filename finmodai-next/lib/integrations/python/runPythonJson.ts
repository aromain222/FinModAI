import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function runPythonJson<T>(
  scriptPath: string,
  args: string[],
): Promise<T | null> {
  try {
    const { stdout } = await execFileAsync('python3', [scriptPath, ...args], {
      maxBuffer: 1024 * 1024,
    });
    const trimmed = stdout.trim();
    if (!trimmed) return null;
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}
