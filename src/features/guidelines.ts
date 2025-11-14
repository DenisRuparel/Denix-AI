import * as path from 'path';
import * as vscode from 'vscode';

const GUIDELINES_FILENAME = 'guidelines.txt';
const DENIX_DIR = '.denix';

export class GuidelinesManager {
  constructor(private readonly workspaceRoot: string | undefined) {}

  private get fileUri(): vscode.Uri | undefined {
    if (!this.workspaceRoot) {
      return undefined;
    }
    return vscode.Uri.file(path.join(this.workspaceRoot, DENIX_DIR, GUIDELINES_FILENAME));
  }

  public async loadGuidelines(): Promise<string> {
    const uri = await this.ensureFile();
    if (!uri) {
      return '';
    }

    try {
      const data = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(data).toString('utf8');
    } catch {
      return '';
    }
  }

  public async saveGuidelines(text: string): Promise<void> {
    const uri = await this.ensureFile();
    if (!uri) {
      throw new Error('Unable to resolve guidelines file path.');
    }

    await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'));
  }

  private async ensureFile(): Promise<vscode.Uri | undefined> {
    if (!this.workspaceRoot) {
      return undefined;
    }

    const dirUri = vscode.Uri.file(path.join(this.workspaceRoot, DENIX_DIR));
    const fileUri = this.fileUri!;

    await vscode.workspace.fs.createDirectory(dirUri);

    try {
      await vscode.workspace.fs.stat(fileUri);
    } catch {
      await vscode.workspace.fs.writeFile(fileUri, Buffer.from('', 'utf8'));
    }

    return fileUri;
  }
}
