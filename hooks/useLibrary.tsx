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
  const { query, library, setLibrary } = useExistingLibrary();

  return (
    <LibraryContext.Provider
      value={
        query.isFetched
          ? { type: 'loaded', library, setLibrary }
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
        }
        return true;
      } catch (error) {
        console.error('Failed to populate from persisted bookmark', error);

        await clearNovelRoot();
      }

      return false;
    },
  });

  return { library, setLibrary, query };
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
      console.log('loading directory:', handlePath, subhandles);
      if (!subhandles.includes('content.opf')) {
        continue;
      }

      const opf = await readAsStringAsync(`${handlePath}/content.opf`, {
        encoding: 'utf8',
      });
      console.log({ opf });

      const matches = opf.match(/<dc:title>\s*([\s\S]*)\s*<\/dc:title>/);
      if (!matches) {
        continue;
      }
      console.log({ matches });
      const [_fullMatch, title] = matches;

      library.push({
        type: 'opf',
        title,
        folderPath: handlePath,
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
    }
  | undefined
>(undefined);
