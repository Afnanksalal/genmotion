import { spawn } from 'node:child_process';
import { GenmotionError } from '../errors.js';

export interface ProcessResult {
  stdout: string;
  stderr: string;
}

export function runProcess(command: string, args: string[], cwd?: string): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (data: string) => { stdout += data; });
    child.stderr.on('data', (data: string) => { stderr += data; });
    child.on('error', (error) => reject(new GenmotionError('PROCESS_START_FAILED', `Could not start ${command}`, error)));
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new GenmotionError('PROCESS_FAILED', `${command} exited with code ${String(code)}: ${stderr.trim()}`, { command, args, code }));
    });
  });
}
