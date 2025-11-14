import * as path from 'path';
import * as vscode from 'vscode';

export interface SelectionContext {
  uri: string;
  fileName: string;
  relativePath: string;
  text: string;
  startLine: number;
  endLine: number;
}

export class SelectionWatcher {
  private currentSelection: SelectionContext | null = null;

  constructor(private readonly workspaceRoot: string | undefined) {}

  public update(selection: SelectionContext | null): void {
    this.currentSelection = selection;
  }

  public updateFromEditor(editor: vscode.TextEditor | undefined): void {
    if (!editor) {
      this.currentSelection = null;
      return;
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
      this.currentSelection = null;
      return;
    }

    const document = editor.document;
    const text = document.getText(selection);
    const startLine = selection.start.line + 1;
    const endLine = selection.end.line + 1;
    const uri = document.uri.fsPath;
    const fileName = path.basename(uri);
    const relativePath = this.workspaceRoot ? path.relative(this.workspaceRoot, uri) : fileName;

    this.currentSelection = {
      uri,
      fileName,
      relativePath,
      text,
      startLine,
      endLine
    };
  }

  public getSelection(): SelectionContext | null {
    return this.currentSelection;
  }
}
