import * as path from 'path';
import * as vscode from 'vscode';

export interface RuleFile {
  name: string;
  path: string;
  content: string;
}

const RULES_DIR = '.denix/rules';

export class RulesManager {
  constructor(private readonly workspaceRoot: string | undefined) {}

  private get rulesDirUri(): vscode.Uri | undefined {
    if (!this.workspaceRoot) {
      return undefined;
    }
    return vscode.Uri.file(path.join(this.workspaceRoot, RULES_DIR));
  }

  public async listRuleFiles(): Promise<RuleFile[]> {
    const dirUri = this.rulesDirUri;
    if (!dirUri) {
      return [];
    }

    const entries: RuleFile[] = [];

    try {
      await vscode.workspace.fs.createDirectory(dirUri);
      const files = await vscode.workspace.fs.readDirectory(dirUri);
      for (const [name, fileType] of files) {
        if (fileType === vscode.FileType.File && name.endsWith('.md')) {
          const filePath = path.join(dirUri.fsPath, name);
          const content = await this.readFile(vscode.Uri.file(filePath));
          entries.push({
            name: name.replace(/\.md$/i, ''),
            path: filePath,
            content
          });
        }
      }
    } catch (error) {
      console.error('Failed to read rule files', error);
    }

    return entries;
  }

  public async createRuleFile(name: string, template = ''): Promise<RuleFile> {
    const dirUri = this.rulesDirUri;
    if (!dirUri) {
      throw new Error('Workspace root not available.');
    }

    await vscode.workspace.fs.createDirectory(dirUri);

    const safeName = name.replace(/\s+/g, '-').toLowerCase();
    const filename = safeName.endsWith('.md') ? safeName : `${safeName}.md`;
    const fileUri = vscode.Uri.file(path.join(dirUri.fsPath, filename));

    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(template, 'utf8'));

    return {
      name: filename.replace(/\.md$/i, ''),
      path: fileUri.fsPath,
      content: template
    };
  }

  public async saveRuleFile(rule: RuleFile): Promise<void> {
    const uri = vscode.Uri.file(rule.path);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(rule.content, 'utf8'));
  }

  public async openRuleFile(rule: RuleFile): Promise<void> {
    const document = await vscode.workspace.openTextDocument(rule.path);
    await vscode.window.showTextDocument(document, { preview: false });
  }

  public async getRuleContent(name: string): Promise<string> {
    const rules = await this.listRuleFiles();
    const rule = rules.find(r => r.name === name);
    if (rule) {
      return rule.content;
    }
    return '';
  }

  public async deleteRuleFile(name: string): Promise<void> {
    const rules = await this.listRuleFiles();
    const rule = rules.find(r => r.name === name);
    if (!rule) {
      throw new Error(`Rule file "${name}" not found`);
    }

    try {
      await vscode.workspace.fs.delete(vscode.Uri.file(rule.path));
    } catch (error) {
      throw new Error(`Failed to delete rule file: ${error}`);
    }
  }

  private async readFile(uri: vscode.Uri): Promise<string> {
    const data = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(data).toString('utf8');
  }
}
