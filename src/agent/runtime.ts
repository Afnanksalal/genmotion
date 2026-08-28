import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENMOTION_VERSION } from '../version.js';

export type AgentHostId = 'codex' | 'claude';

export interface AgentHostStatus {
  id: AgentHostId;
  label: string;
  installed: boolean;
  authenticated: boolean;
  detail: string;
}

export interface AgentSelection {
  sceneId?: string;
  layerId?: string;
  frame?: number;
}

export interface AgentRunInput {
  host: AgentHostId;
  prompt: string;
  selection: AgentSelection;
  projectDir: string;
  projectFile: string;
  projectTitle: string;
  signal?: AbortSignal;
}

export interface AgentRunProgress {
  message?: string;
  activity?: string;
  sessionId?: string;
}

export interface AgentRunResult {
  response: string;
  sessionId: string;
}

export interface AgentRuntime {
  hosts(): Promise<AgentHostStatus[]>;
  run(input: AgentRunInput, onProgress: (progress: AgentRunProgress) => Promise<void> | void): Promise<AgentRunResult>;
  close(): Promise<void>;
}

interface StoredSessions {
  version: 1;
  codex?: string;
  claude?: string;
}

interface JsonObject { [key: string]: unknown }

const MAX_CAPTURE = 120_000;
const PROCESS_TIMEOUT = 15 * 60_000;

function object(value: unknown): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function appendLimited(current: string, addition: string): string {
  const combined = current + addition;
  return combined.length <= MAX_CAPTURE ? combined : combined.slice(combined.length - MAX_CAPTURE);
}

async function capture(command: string, args: string[], cwd: string, timeoutMs = 10_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false });
    const finish = (code: number): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    };
    child.stdout.on('data', (chunk: Buffer) => { stdout = appendLimited(stdout, chunk.toString()); });
    child.stderr.on('data', (chunk: Buffer) => { stderr = appendLimited(stderr, chunk.toString()); });
    child.once('error', () => finish(-1));
    child.once('close', (code) => finish(code ?? -1));
    const timer = setTimeout(() => { child.kill(); finish(-1); }, timeoutMs);
  });
}

function buildPrompt(input: AgentRunInput): string {
  const context = [
    input.selection.sceneId ? `scene ${input.selection.sceneId}` : '',
    input.selection.layerId ? `layer ${input.selection.layerId}` : '',
    input.selection.frame !== undefined ? `frame ${String(input.selection.frame)}` : '',
  ].filter(Boolean).join(', ') || 'the whole composition';
  return [
    'You are the production agent embedded in Genmotion Studio.',
    `The active project is ${input.projectTitle}.`,
    `The typed Creative IR is ${input.projectFile}.`,
    `The user is currently focused on ${context}.`,
    '',
    'Apply the request to the real Genmotion project when it asks for a change. Use the genmotion MCP tools when available: read the current revision, patch precise paths transactionally, validate, and inspect rendered frames. The Creative IR is an open authoring surface: design original scenes, direct property tracks, custom cubic-bezier or spring timing, and SVG path geometry. Named recipes are optional references, never a required template. Preserve truthful product evidence, local asset provenance, reproducible frame evaluation, existing brand decisions, and unrelated human edits. Do not create HTML, Remotion, HyperFrames, placeholder copy, fake product behavior, or unsourced claims. Do not commit, publish, install packages, access credentials, or use the network. For a visual change, inspect at least one representative native frame before finishing. Do not render the full video, create contact sheets, or start servers unless the user explicitly asks to export or review the full timeline.',
    '',
    `User request: ${input.prompt}`,
    '',
    'Finish with a concise explanation of what changed or, for a question or critique, a direct answer. If the request cannot be completed safely with the available project files, explain the exact blocker and do not fabricate a result.',
  ].join('\n');
}

class CodexClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, { resolve: (value: JsonObject) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private nextId = 1;
  private closed = false;
  private notificationHandler: (method: string, params: JsonObject) => void = () => undefined;

  constructor(cwd: string) {
    this.child = spawn('codex', ['app-server', '--stdio'], { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: false });
    const lines = createInterface({ input: this.child.stdout });
    lines.on('line', (line) => this.receive(line));
    this.child.stderr.on('data', () => undefined);
    this.child.once('error', (error) => this.rejectAll(error));
    this.child.once('close', (code) => this.rejectAll(new Error(`Codex app-server exited with code ${String(code ?? -1)}.`)));
  }

  onNotification(handler: (method: string, params: JsonObject) => void): void {
    this.notificationHandler = handler;
  }

  notify(method: string, params: JsonObject): void {
    this.write({ method, params });
  }

  request(method: string, params: JsonObject = {}): Promise<JsonObject> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex ${method} timed out.`));
      }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ id, method, params });
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.child.stdin.end();
    const timer = setTimeout(() => this.child.kill(), 1_000);
    timer.unref();
  }

  private write(message: JsonObject): void {
    if (this.closed) throw new Error('Codex app-server connection is closed.');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private receive(line: string): void {
    let message: JsonObject;
    try { message = object(JSON.parse(line)) ?? {}; } catch { return; }
    const id = typeof message.id === 'number' ? message.id : undefined;
    const method = string(message.method);
    if (id !== undefined && method) {
      this.answerServerRequest(id, method);
      return;
    }
    if (id !== undefined) {
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      clearTimeout(pending.timer);
      const error = object(message.error);
      if (error) pending.reject(new Error(string(error.message) ?? `Codex request ${String(id)} failed.`));
      else pending.resolve(object(message.result) ?? {});
      return;
    }
    if (method) this.notificationHandler(method, object(message.params) ?? {});
  }

  private answerServerRequest(id: number, method: string): void {
    if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') {
      this.write({ id, result: { decision: 'decline' } });
      return;
    }
    if (method === 'item/permissions/requestApproval') {
      this.write({ id, result: { permissions: {}, scope: 'turn' } });
      return;
    }
    this.write({ id, error: { code: -32601, message: `Genmotion Studio cannot handle ${method}.` } });
  }

  private rejectAll(error: Error): void {
    if (this.closed && this.pending.size === 0) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

export class LocalAgentRuntime implements AgentRuntime {
  private readonly projectDir: string;
  private readonly sessionsFile: string;
  private readonly skillFile: string;
  private readonly children = new Set<ChildProcessWithoutNullStreams>();
  private readonly codexClients = new Set<CodexClient>();
  private sessions: StoredSessions = { version: 1 };
  private sessionsLoaded = false;

  constructor(projectDir: string, skillFile?: string) {
    this.projectDir = projectDir;
    this.sessionsFile = path.join(projectDir, '.genmotion', 'agent-sessions.json');
    this.skillFile = skillFile ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../skills/genmotion/SKILL.md');
  }

  async hosts(): Promise<AgentHostStatus[]> {
    const [codex, claude] = await Promise.all([
      capture('codex', ['login', 'status'], this.projectDir),
      capture('claude', ['auth', 'status', '--json'], this.projectDir),
    ]);
    let claudeAuthenticated = false;
    try { claudeAuthenticated = object(JSON.parse(claude.stdout))?.loggedIn === true; } catch { claudeAuthenticated = false; }
    return [
      { id: 'codex', label: 'Codex', installed: codex.code !== -1, authenticated: codex.code === 0 && /logged in/i.test(codex.stdout + codex.stderr), detail: codex.code === 0 ? 'Uses your local ChatGPT sign-in' : 'Run codex login' },
      { id: 'claude', label: 'Claude', installed: claude.code !== -1, authenticated: claude.code === 0 && claudeAuthenticated, detail: claudeAuthenticated ? 'Uses your local Claude sign-in' : 'Run claude auth login' },
    ];
  }

  async run(input: AgentRunInput, onProgress: (progress: AgentRunProgress) => Promise<void> | void): Promise<AgentRunResult> {
    await this.loadSessions();
    return input.host === 'codex' ? this.runCodex(input, onProgress) : this.runClaude(input, onProgress);
  }

  close(): Promise<void> {
    for (const client of this.codexClients) client.close();
    this.codexClients.clear();
    for (const child of this.children) child.kill();
    this.children.clear();
    return Promise.resolve();
  }

  private async loadSessions(): Promise<void> {
    if (this.sessionsLoaded) return;
    this.sessionsLoaded = true;
    try {
      const parsed = object(JSON.parse(await readFile(this.sessionsFile, 'utf8')));
      if (parsed?.version === 1) {
        this.sessions = { version: 1 };
        if (typeof parsed.codex === 'string') this.sessions.codex = parsed.codex;
        if (typeof parsed.claude === 'string') this.sessions.claude = parsed.claude;
      }
    } catch { this.sessions = { version: 1 }; }
  }

  private async saveSessions(): Promise<void> {
    const { mkdir, rename, writeFile } = await import('node:fs/promises');
    await mkdir(path.dirname(this.sessionsFile), { recursive: true });
    const temporary = `${this.sessionsFile}.${process.pid.toString()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.sessions, null, 2)}\n`);
    await rename(temporary, this.sessionsFile);
  }

  private async runCodex(input: AgentRunInput, onProgress: (progress: AgentRunProgress) => Promise<void> | void): Promise<AgentRunResult> {
    const client = new CodexClient(input.projectDir);
    this.codexClients.add(client);
    let response = '';
    let turnError = '';
    let workStarted = false;
    let changesApplied = false;
    const completed = new Promise<{ status: string }>((resolve) => {
      client.onNotification((method, params) => {
        if (method === 'item/agentMessage/delta') {
          const delta = string(params.delta) ?? '';
          response = appendLimited(response, delta);
          void onProgress({ message: response, activity: changesApplied ? 'Finishing' : 'Preparing answer', ...(this.sessions.codex ? { sessionId: this.sessions.codex } : {}) });
        } else if (method === 'item/completed') {
          const item = object(params.item);
          if (item?.type === 'agentMessage' && typeof item.text === 'string') {
            response = item.text;
            void onProgress({ message: response, activity: changesApplied ? 'Finishing' : 'Preparing answer', ...(this.sessions.codex ? { sessionId: this.sessions.codex } : {}) });
          }
        } else if (method === 'item/started') {
          const type = string(object(params.item)?.type);
          if (type === 'commandExecution') workStarted = true;
          if (type === 'fileChange') { workStarted = true; changesApplied = true; }
          const activity = type === 'commandExecution' ? (changesApplied ? 'Validating changes' : 'Inspecting project') : type === 'fileChange' ? 'Applying changes' : type === 'reasoning' ? (workStarted ? 'Planning next step' : 'Understanding request') : undefined;
          if (activity) void onProgress({ activity });
        } else if (method === 'error') {
          turnError = string(object(params.error)?.message) ?? 'Codex reported an error.';
        } else if (method === 'turn/completed') {
          const turn = object(params.turn);
          const error = object(turn?.error);
          if (error) turnError = string(error.message) ?? turnError;
          resolve({ status: string(turn?.status) ?? 'failed' });
        }
      });
    });
    let turnTimeout: NodeJS.Timeout | undefined;
    let abortHandler: (() => void) | undefined;
    try {
      await client.request('initialize', { clientInfo: { name: 'genmotion_studio', title: 'Genmotion Studio', version: GENMOTION_VERSION } });
      client.notify('initialized', {});
      const account = await client.request('account/read', { refreshToken: false });
      if (!object(account.account) && account.requiresOpenaiAuth === true) throw new Error('Codex is not signed in. Run codex login, then retry.');
      let thread: JsonObject | undefined;
      if (this.sessions.codex) {
        try { thread = object((await client.request('thread/resume', { threadId: this.sessions.codex, cwd: input.projectDir, approvalPolicy: 'never', sandbox: 'workspace-write' })).thread); }
        catch { delete this.sessions.codex; }
      }
      if (!thread) {
        thread = object((await client.request('thread/start', { cwd: input.projectDir, approvalPolicy: 'never', sandbox: 'workspace-write', serviceName: 'genmotion_studio' })).thread);
        const createdId = string(thread?.id);
        if (createdId) {
          this.sessions.codex = createdId;
          await client.request('thread/name/set', { threadId: createdId, name: `Genmotion · ${input.projectTitle}` });
        }
      }
      const threadId = string(thread?.id);
      if (!threadId) throw new Error('Codex did not return a thread id.');
      this.sessions.codex = threadId;
      await this.saveSessions();
      await onProgress({ activity: 'Thinking', sessionId: threadId });
      const skillExists = await readFile(this.skillFile, 'utf8').then(() => true, () => false);
      const turnInput: unknown[] = [{ type: 'text', text: `$genmotion\n\n${buildPrompt(input)}` }];
      if (skillExists) turnInput.push({ type: 'skill', name: 'genmotion', path: this.skillFile });
      await client.request('turn/start', { threadId, input: turnInput, cwd: input.projectDir, approvalPolicy: 'never', sandboxPolicy: { type: 'workspaceWrite', writableRoots: [input.projectDir], networkAccess: false } });
      const result = await Promise.race([
        completed,
        new Promise<never>((_resolve, reject) => { turnTimeout = setTimeout(() => reject(new Error('Codex agent turn timed out after 15 minutes.')), PROCESS_TIMEOUT); }),
        new Promise<never>((_resolve, reject) => {
          abortHandler = () => { client.close(); reject(new Error('Agent turn cancelled.')); };
          if (input.signal?.aborted) abortHandler();
          else input.signal?.addEventListener('abort', abortHandler, { once: true });
        }),
      ]);
      if (result.status !== 'completed') throw new Error(turnError || `Codex turn ${result.status}.`);
      return { response: response.trim() || 'The Codex turn completed without a text response.', sessionId: threadId };
    } finally {
      if (turnTimeout) clearTimeout(turnTimeout);
      if (abortHandler) input.signal?.removeEventListener('abort', abortHandler);
      client.close();
      this.codexClients.delete(client);
    }
  }

  private async runClaude(input: AgentRunInput, onProgress: (progress: AgentRunProgress) => Promise<void> | void): Promise<AgentRunResult> {
    const mcpConfig = path.join(input.projectDir, '.genmotion', 'agent-mcp.json');
    const mcpEntry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../mcp.js');
    await mkdir(path.dirname(mcpConfig), { recursive: true });
    await writeFile(mcpConfig, `${JSON.stringify({ mcpServers: { genmotion: { type: 'stdio', command: process.execPath, args: [mcpEntry], env: { GENMOTION_ALLOWED_ROOTS: input.projectDir } } } }, null, 2)}\n`);
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--permission-mode', 'acceptEdits', '--mcp-config', mcpConfig, '--tools', 'Read,Edit,Write,Glob,Grep,mcp__genmotion', '--allowedTools', 'mcp__genmotion'];
    if (this.sessions.claude) args.push('--resume', this.sessions.claude);
    const child = spawn('claude', args, { cwd: input.projectDir, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: false });
    this.children.add(child);
    let response = '';
    let stderr = '';
    let sessionId = this.sessions.claude ?? '';
    let resultError = '';
    const abortHandler = (): void => {
      child.kill();
    };
    if (input.signal?.aborted) abortHandler();
    else input.signal?.addEventListener('abort', abortHandler, { once: true });
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      let event: JsonObject;
      try { event = object(JSON.parse(line)) ?? {}; } catch { return; }
      const eventSession = string(event.session_id);
      if (eventSession) sessionId = eventSession;
      if (event.type === 'stream_event') {
        const delta = object(object(event.event)?.delta);
        const text = string(delta?.text);
        if (text) {
          response = appendLimited(response, text);
          void onProgress({ message: response, activity: 'Responding', ...(sessionId ? { sessionId } : {}) });
        }
      } else if (event.type === 'assistant') {
        const content = object(event.message)?.content;
        if (Array.isArray(content)) {
          const text = content.map((part) => object(part)).filter((part): part is JsonObject => part?.type === 'text').map((part) => string(part.text) ?? '').join('');
          if (text) {
            response = text;
            void onProgress({ message: response, activity: 'Responding', ...(sessionId ? { sessionId } : {}) });
          }
        }
      } else if (event.type === 'result') {
        const final = string(event.result);
        if (final) response = final;
        if (event.is_error === true) resultError = final || 'Claude reported an error.';
      } else if (event.type === 'system' && event.subtype === 'api_retry' && event.error === 'authentication_failed') {
        resultError = 'Claude authentication failed. Run claude auth login, then refresh agent connections.';
        child.kill();
      } else if (event.type === 'system' && event.subtype === 'init') {
        void onProgress({ activity: 'Thinking', ...(sessionId ? { sessionId } : {}) });
      }
    });
    child.stderr.on('data', (chunk: Buffer) => { stderr = appendLimited(stderr, chunk.toString()); });
    child.stdin.end(buildPrompt(input));
    const code = await new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (value) => resolve(value ?? -1));
      const timeout = setTimeout(() => { child.kill(); reject(new Error('Claude agent turn timed out after 15 minutes.')); }, PROCESS_TIMEOUT);
      child.once('close', () => clearTimeout(timeout));
    }).finally(() => {
      input.signal?.removeEventListener('abort', abortHandler);
      this.children.delete(child);
    });
    if (input.signal?.aborted) throw new Error('Agent turn cancelled.');
    if (code !== 0 || resultError) throw new Error(resultError || stderr.trim() || `Claude exited with code ${String(code)}.`);
    if (!sessionId) throw new Error('Claude completed without returning a session id.');
    this.sessions.claude = sessionId;
    await this.saveSessions();
    return { response: response.trim() || 'The Claude turn completed without a text response.', sessionId };
  }
}

export { buildPrompt };
