export interface UploadHandler {
  getImages(): Blob[];
  clear(): void;
  attachTo(fileInput: HTMLInputElement, onUpdate: () => void): void;
  detach(): void;
}

export function createUploadHandler(): UploadHandler {
  const images: Blob[] = [];
  let pasteHandler: ((e: Event) => void) | null = null;

  return {
    getImages: () => [...images],
    clear: () => { images.length = 0; },
    detach() {
      if (pasteHandler) {
        document.removeEventListener('paste', pasteHandler);
        pasteHandler = null;
      }
    },
    attachTo(fileInput: HTMLInputElement, onUpdate: () => void) {
      fileInput.addEventListener('change', (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (files) {
          Array.from(files).forEach((file) => images.push(file));
        }
        onUpdate();
      });

      // Remove previous paste handler if any
      if (pasteHandler) {
        document.removeEventListener('paste', pasteHandler);
      }

      // Paste handler on document — shadow root doesn't receive paste events
      // Uses event.clipboardData.items (no permission popup, user-initiated)
      pasteHandler = (e: Event) => {
        const clipboardEvent = e as ClipboardEvent;
        const items = clipboardEvent.clipboardData?.items ?? [];
        let added = false;
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            if (blob) {
              images.push(blob);
              added = true;
            }
          }
        }
        if (added) {
          clipboardEvent.preventDefault();
          onUpdate();
        }
      };
      document.addEventListener('paste', pasteHandler);
    },
  };
}
