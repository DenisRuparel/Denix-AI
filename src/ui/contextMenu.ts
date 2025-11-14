export interface ContextMenuOption {
  id: string;
  label: string;
  children?: ContextMenuOption[];
}

export class ContextMenuProvider {
  public getRootOptions(): ContextMenuOption[] {
    return [
      { id: 'default-context', label: 'Default Context' },
      { id: 'files', label: 'Files', children: [] },
      { id: 'folders', label: 'Folders', children: [] },
      { id: 'clear', label: 'Clear Context' },
      { id: 'focus', label: 'Focus context' }
    ];
  }
}
