import * as fs from 'fs';
import * as path from 'path';

export class WorkspaceStorage {
  constructor(private readonly workspaceRoot: string) {}

  public resolve(...segments: string[]): string {
    return path.join(this.workspaceRoot, ...segments);
  }

  public async ensureDirectory(dirPath: string): Promise<void> {
    await fs.promises.mkdir(dirPath, { recursive: true });
  }

  public async readFile(filePath: string): Promise<string | null> {
    try {
      return await fs.promises.readFile(filePath, 'utf8');
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  public async writeFile(filePath: string, content: string): Promise<void> {
    await this.ensureDirectory(path.dirname(filePath));
    await fs.promises.writeFile(filePath, content, 'utf8');
  }
}
