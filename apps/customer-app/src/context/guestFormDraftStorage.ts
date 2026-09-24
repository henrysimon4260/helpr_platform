import { Platform } from 'react-native';

import {
  DraftStorage,
  GUEST_FORM_DRAFT_KEY,
  GuestFormDraft,
  guestDraftFilePath,
  readGuestFormDraft,
  writeGuestFormDraft,
} from './guestFormDraft';

type FileSystemLike = {
  documentDirectory?: string | null;
  getInfoAsync: (path: string) => Promise<{ exists: boolean }>;
  readAsStringAsync: (path: string) => Promise<string>;
  writeAsStringAsync: (path: string, contents: string) => Promise<void>;
  deleteAsync: (path: string, options?: { idempotent?: boolean }) => Promise<void>;
};

function createLocalStorageDraftStorage(storage: Storage): DraftStorage {
  return {
    getItem: key => Promise.resolve(storage.getItem(key)),
    setItem: (key, value) => Promise.resolve(storage.setItem(key, value)),
    removeItem: key => Promise.resolve(storage.removeItem(key)),
  };
}

export function createFileDraftStorage(fileSystem: FileSystemLike): DraftStorage {
  const resolvePath = (key: string) => {
    const directory = fileSystem.documentDirectory;
    if (!directory) {
      return null;
    }
    return guestDraftFilePath(directory, key);
  };

  return {
    async getItem(key) {
      try {
        const path = resolvePath(key);
        if (!path) {
          return null;
        }
        const info = await fileSystem.getInfoAsync(path);
        if (!info.exists) {
          return null;
        }
        return fileSystem.readAsStringAsync(path);
      } catch (error) {
        console.warn('Failed to read guest form draft', error);
        return null;
      }
    },
    async setItem(key, value) {
      try {
        const path = resolvePath(key);
        if (!path) {
          return;
        }
        await fileSystem.writeAsStringAsync(path, value);
      } catch (error) {
        console.warn('Failed to write guest form draft', error);
      }
    },
    async removeItem(key) {
      try {
        const path = resolvePath(key);
        if (!path) {
          return;
        }
        await fileSystem.deleteAsync(path, { idempotent: true });
      } catch (error) {
        console.warn('Failed to delete guest form draft', error);
      }
    },
  };
}

export function createPlatformDraftStorage(): DraftStorage {
  if (Platform.OS === 'web' && typeof globalThis.localStorage !== 'undefined') {
    return createLocalStorageDraftStorage(globalThis.localStorage);
  }

  let fileStorage: DraftStorage | null = null;
  const fileApi = async () => {
    if (fileStorage) {
      return fileStorage;
    }

    const noop: DraftStorage = {
      getItem: async () => null,
      setItem: async () => undefined,
      removeItem: async () => undefined,
    };

    try {
      const primary = (await import('expo-file-system')) as FileSystemLike;
      if (primary.documentDirectory && typeof primary.getInfoAsync === 'function') {
        fileStorage = createFileDraftStorage(primary);
        return fileStorage;
      }
    } catch (error) {
      console.warn('Guest form draft file storage unavailable', error);
    }

    try {
      const legacySpecifier = 'expo-file-system/legacy';
      const legacy = (await import(legacySpecifier)) as FileSystemLike;
      fileStorage = createFileDraftStorage(legacy);
      return fileStorage;
    } catch (error) {
      console.warn('Guest form draft legacy file storage unavailable', error);
    }

    fileStorage = noop;
    return fileStorage;
  };

  return {
    getItem: async key => (await fileApi()).getItem(key),
    setItem: async (key, value) => (await fileApi()).setItem(key, value),
    removeItem: async key => (await fileApi()).removeItem(key),
  };
}

let activeStorage: DraftStorage | null = null;

export function setGuestFormDraftStorage(storage: DraftStorage) {
  activeStorage = storage;
}

export function getGuestFormDraftStorage(): DraftStorage {
  if (!activeStorage) {
    activeStorage = createPlatformDraftStorage();
  }
  return activeStorage;
}

export function loadGuestFormDraft(): Promise<GuestFormDraft | null> {
  return readGuestFormDraft(getGuestFormDraftStorage());
}

export function saveGuestFormDraft(draft: GuestFormDraft | null): Promise<void> {
  return writeGuestFormDraft(getGuestFormDraftStorage(), draft, GUEST_FORM_DRAFT_KEY);
}
