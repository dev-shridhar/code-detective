export namespace workspace {
  export const workspaceFolders = undefined;
  export async function findFiles() { return []; }
  export async function openTextDocument() { throw new Error('not mocked'); }
}

export namespace window {
  export function createWebviewPanel() { throw new Error('not mocked'); }
  export function showInformationMessage(..._args: any[]) {}
  export function showTextDocument() { throw new Error('not mocked'); }
}

class UriMock {
  public scheme = 'file';
  public authority = '';
  public path: string;

  constructor(str: string) {
    // Handle both file:///path and /path forms
    if (str.startsWith('file://')) {
      this.path = str.slice(7);
    } else {
      this.path = str;
    }
  }

  get fsPath(): string {
    return this.path;
  }

  toString(): string {
    return `file://${this.path}`;
  }

  toJSON(): string {
    return this.fsPath;
  }

  with(_change: any): UriMock {
    return this;
  }

  static file(fsPath: string): UriMock {
    return new UriMock(fsPath);
  }

  static parse(s: string): UriMock {
    return new UriMock(s);
  }

  static joinPath(base: UriMock, ...parts: string[]): UriMock {
    return new UriMock([base.fsPath, ...parts].join('/'));
  }
}

export const Uri = UriMock;

export namespace commands {
  export function executeCommand(_cmd: string, ..._args: any[]) {
    throw new Error('not mocked');
  }
}

export type TextEditor = any;
export type ExtensionContext = any;
export type WebviewPanel = any;
export type TextDocument = any;
export type Hover = any;
export type Location = any;
export type Position = any;
export type Range = any;
export type Selection = any;
export type TextEditorRevealType = any;
export type ViewColumn = any;

const _vs: any = { workspace, window, Uri, commands };
export default _vs;
