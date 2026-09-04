import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom's File lacks Blob.text(); browsers provide this native method.
if (!File.prototype.text) {
  File.prototype.text = function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(this);
    });
  };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
