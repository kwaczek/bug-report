export interface UploadHandler {
  getImages(): Blob[];
  clear(): void;
  attachTo(shadowRoot: ShadowRoot, fileInput: HTMLInputElement): void;
}

export function createUploadHandler(): UploadHandler {
  const images: Blob[] = [];

  return {
    getImages: () => [...images],
    clear: () => { images.length = 0; },
    attachTo(shadowRoot: ShadowRoot, fileInput: HTMLInputElement) {
      fileInput.addEventListener('change', (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (files) {
          Array.from(files).forEach((file) => images.push(file));
        }
      });

      // Paste handler — use event.clipboardData.items (no permission needed, user-initiated)
      // Do NOT use the Clipboard API's read() method — it triggers a browser permission popup
      // multiple images are supported: each paste/file event can add more blobs
      shadowRoot.addEventListener('paste', (e: Event) => {
        const clipboardEvent = e as ClipboardEvent;
        clipboardEvent.preventDefault();
        const items = clipboardEvent.clipboardData?.items ?? [];
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            if (blob) images.push(blob);
          }
        }
      });
    },
  };
}
