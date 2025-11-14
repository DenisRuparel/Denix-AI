import * as path from 'path';
import * as vscode from 'vscode';

export interface MemoryEntry {
  section: string;
  content: string;
}

const DEFAULT_MEMORIES = '# Denix AI Memories\n\n';
const MEMORIES_FILENAME = 'memories.md';
const DENIX_DIR = '.denix';

export class MemoriesManager {
  constructor(private readonly workspaceRoot: string | undefined) {}

  private get memoriesDir(): string | undefined {
    if (!this.workspaceRoot) {
      return undefined;
    }
    return path.join(this.workspaceRoot, DENIX_DIR);
  }

  private get memoriesPath(): string | undefined {
    const dir = this.memoriesDir;
    if (!dir) {
      return undefined;
    }
    return path.join(dir, MEMORIES_FILENAME);
  }

  public async openMemoriesDocument(): Promise<void> {
    const uri = await this.ensureMemoriesFile();
    if (!uri) {
      vscode.window.showErrorMessage('Unable to locate workspace to open memories file.');
      return;
    }

    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, { preview: false });
  }

  public async loadMemories(): Promise<string> {
    const fileUri = await this.ensureMemoriesFile();
    if (!fileUri) {
      return DEFAULT_MEMORIES;
    }

    const existing = await vscode.workspace.fs.readFile(fileUri);
    return Buffer.from(existing).toString('utf8');
  }

  public async saveMemories(markdown: string): Promise<void> {
    const fileUri = await this.ensureMemoriesFile();
    if (!fileUri) {
      throw new Error('No workspace folder available to save memories.');
    }

    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(markdown, 'utf8'));
  }

  public async getRelevantMemories(keywords: string[]): Promise<MemoryEntry[]> {
    const markdown = await this.loadMemories();

    // Quick parse: split by sections delineated with ## headings
    const sections = this.splitSections(markdown);

    if (keywords.length === 0) {
      return sections;
    }

    const lowerKeywords = keywords.map(k => k.toLowerCase());
    return sections.filter(section => {
      const haystack = `${section.section}\n${section.content}`.toLowerCase();
      return lowerKeywords.some(keyword => haystack.includes(keyword));
    });
  }

  private splitSections(markdown: string): MemoryEntry[] {
    const lines = markdown.split(/\r?\n/);
    const entries: MemoryEntry[] = [];
    let currentTitle = 'General';
    let buffer: string[] = [];

    const pushCurrent = () => {
      if (buffer.length === 0) {
        return;
      }
      entries.push({ section: currentTitle.trim(), content: buffer.join('\n').trim() });
      buffer = [];
    };

    for (const line of lines) {
      const headingMatch = /^##\s+(.*)/.exec(line.trim());
      if (headingMatch) {
        pushCurrent();
        currentTitle = headingMatch[1];
        continue;
      }

      if (!line.startsWith('#')) {
        buffer.push(line);
      }
    }

    pushCurrent();
    return entries.filter(entry => entry.content.length > 0);
  }

  private async ensureMemoriesFile(): Promise<vscode.Uri | undefined> {
    if (!this.workspaceRoot) {
      return undefined;
    }

    const dir = this.memoriesDir!;
    const filePath = this.memoriesPath!;
    const dirUri = vscode.Uri.file(dir);
    const fileUri = vscode.Uri.file(filePath);

    await vscode.workspace.fs.createDirectory(dirUri);

    try {
      await vscode.workspace.fs.stat(fileUri);
    } catch {
      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(DEFAULT_MEMORIES, 'utf8'));
    }

    return fileUri;
  }
}
