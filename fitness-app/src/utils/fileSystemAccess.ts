// Minimal typings for the File System Access API, which is still absent from the default
// DOM lib. Shared so the several "save this to a file the user picks" paths don't each
// re-declare it (or fall back to `any`).

export interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}

export interface SaveFileHandle {
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}

export type WindowWithSavePicker = Window & {
  showSaveFilePicker(options: SaveFilePickerOptions): Promise<SaveFileHandle>;
};

// `showSaveFilePicker` throws AbortError when the user dismisses the picker — that's a
// cancel, not a failure, and callers should fall back silently rather than surface an error.
export function isPickerAbort(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError';
}
