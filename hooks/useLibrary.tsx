import * as React from 'react';
import { Book } from '@/types/book.types';
import { readBookmark } from '@/modules/bookmarks';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import {
  readDirectoryAsync,
  getInfoAsync,
  readAsStringAsync,
} from 'expo-file-system';

export function LibraryProvider({ children }: React.PropsWithChildren) {
  const { query, library, setLibrary, libraryDir } = useExistingLibrary();

  return (
    <LibraryContext.Provider
      value={
        query.isFetched
          ? { type: 'loaded', library, setLibrary, libraryDir }
          : { type: 'loading' }
      }>
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const context = React.useContext(LibraryContext);
  if (!context) {
    throw new Error('useLibrary must be used within a LibraryContext');
  }

  return context;
}

function useExistingLibrary() {
  const [libraryDir, setLibraryDir] = React.useState('');
  const [library, setLibrary] = React.useState(new Array<Book>());

  // Check whether we've got an already-saved directory where the novels are
  // stored.
  const query = useQuery({
    queryKey: ['checkExistingNovelDirectory'],
    queryFn: async () => {
      const clearNovelRoot = () =>
        AsyncStorage.removeItem('novel_root').catch(error => {
          console.error('Failed to clear novel_root', error);
        });

      try {
        const novelRoot = await AsyncStorage.getItem('novel_root');
        if (!novelRoot) {
          return false;
        }
        const bookmark = readBookmark(novelRoot);
        if (!bookmark) {
          console.log('No existing novel directory.');
          await clearNovelRoot();
          return false;
        }

        console.log(`loading existing novel directory: ${bookmark}`);
        const library = await readLibrary(bookmark);
        if (library) {
          setLibrary(library);
          setLibraryDir(bookmark);
        }
        return true;
      } catch (error) {
        console.error('Failed to populate from persisted bookmark', error);

        await clearNovelRoot();
      }

      return false;
    },
  });

  return { library, setLibrary, libraryDir, query };
}

export async function readLibrary(directoryPath: string) {
  // The path will have come from the file picker, and so is percent-encoded.
  directoryPath = directoryPath.replace(/\/*$/, '');
  console.log('DirectoryPath:', directoryPath);

  try {
    // readDirectoryAsync can take raw or percent-encoded paths as input, but
    // always outputs file/folder names as raw.
    const handles = await readDirectoryAsync(directoryPath);
    console.log('handles:', handles);

    const library = new Array<Book>();
    for (const handle of handles) {
      const handlePath = `${directoryPath}/${encodeURIComponent(handle)}`;

      const { isDirectory } = await getInfoAsync(handlePath);
      if (!isDirectory) {
        continue;
      }

      const subhandles = await readDirectoryAsync(handlePath);
      if (!subhandles.includes('content.opf')) {
        continue;
      }

      const opf = await readAsStringAsync(`${handlePath}/content.opf`, {
        encoding: 'utf8',
      });

      // FIXME: replace all this stubborn RegEx parsing with a proper xmltojs
      // implementation.
      const titleMatches = opf.match(/<dc:title.*>\s*([\s\S]*)\s*<\/dc:title>/);
      if (!titleMatches) {
        continue;
      }

      const [, title] = titleMatches;

      const spineMatches = opf.match(/<spine.*>\s*([\s\S]*)\s*<\/spine>/);
      if (!spineMatches) {
        continue;
      }
      const [, spine] = spineMatches;

      const itemrefMatches = spine.match(/<itemref\s+([\s\S]*)\s*\/>/);
      if (!itemrefMatches) {
        continue;
      }
      const [, itemref] = itemrefMatches;
      // Woe betide us if there's an escaped quote in the ID.
      const idrefMatches = itemref.match(/idref="(.*?)"/);
      if (!idrefMatches) {
        continue;
      }
      const [, idref] = idrefMatches;

      const manifestMatches = opf.match(
        /<manifest.*>\s*([\s\S]*)\s*<\/manifest>/,
      );
      if (!manifestMatches) {
        continue;
      }
      const [, manifest] = manifestMatches;

      const startingItemMatches = manifest.match(
        new RegExp(`<item.+id="${idref}".*/>`),
      );
      if (!startingItemMatches) {
        continue;
      }
      const [startingItem] = startingItemMatches;

      const startingHrefMatches = startingItem.match(/href="(.*?)"/);
      if (!startingHrefMatches) {
        continue;
      }
      const [, startingHref] = startingHrefMatches;

      console.log('startingHref', startingHref);

      library.push({
        type: 'opf',
        title,
        folderUri: handlePath,
        folderName: handle,
        startingHref,
      });
    }

    return library;
  } catch (error) {
    if ((error as any).code === 'DOCUMENT_PICKER_CANCELED') {
      return null;
    }

    console.error('Error loading library', error);
  }

  return null;
}

const LibraryContext = React.createContext<
  | { type: 'loading' }
  | {
      type: 'loaded';
      library: Array<Book>;
      setLibrary: React.Dispatch<React.SetStateAction<Book[]>>;
      libraryDir: string;
    }
  | undefined
>(undefined);
