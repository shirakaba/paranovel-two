import * as React from 'react';
import { readBookmark } from '@/modules/bookmarks';
import type { Book } from '@/types/book.types';
import type { OPF } from '@/types/opf.types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { XMLParser } from 'fast-xml-parser';
import {
  readDirectoryAsync,
  getInfoAsync,
  readAsStringAsync,
} from 'expo-file-system';

export function LibraryProvider({ children }: React.PropsWithChildren) {
  const { query, library, setLibrary, libraryDir, setLibraryDir } =
    useExistingLibrary();

  return (
    <LibraryContext.Provider
      value={
        query.isFetched
          ? { type: 'loaded', library, setLibrary, libraryDir, setLibraryDir }
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

  return { library, setLibrary, libraryDir, setLibraryDir, query };
}

export async function readLibrary(directoryPath: string) {
  // The path will have come from the file picker, and so is percent-encoded.
  directoryPath = directoryPath.replace(/\/*$/, '');

  try {
    // readDirectoryAsync can take raw or percent-encoded paths as input, but
    // always outputs file/folder names as raw.
    const handles = await readDirectoryAsync(directoryPath);

    const library = new Array<Book>();
    for (const handle of handles) {
      const handleUri = `${directoryPath}/${encodeURIComponent(handle)}`;

      try {
        const { isDirectory } = await getInfoAsync(handleUri);
        if (!isDirectory) {
          // We don't support .epub files directly; we need them to be unzipped
          // first.
          //
          // TODO: In theory, we could detect .epub files and offer to unzip
          //       them for the user, based on the following EPUB 2 spec:
          // https://www.loc.gov/preservation/digital/formats/fdd/fdd000278.shtml
          // > From OCF 2.01 specification:
          // > - The bytes "PK" will be at the beginning of the file
          // > - The bytes "mimetype" will be at position 30
          // > - Actual MIME type (i.e., the ASCII string "application/epub+zip")
          // >   will begin at position 38
          continue;
        }

        // It seems that technically the .opf file may refer to other XML files,
        // but the most common case is for it to be a single file, so we'll
        // handle only that until we find any examples to the contrary.
        // https://idpf.org/epub/20/spec/OPF_2.0.1_draft.htm#TOC1.2

        const subhandles = await readDirectoryAsync(handleUri);

        // 1) Check that the mimetype is 'application/epub+zip'.
        if (!subhandles.includes('mimetype')) {
          continue;
        }
        const mimetype = await readAsStringAsync(`${handleUri}/mimetype`);
        if (mimetype !== 'application/epub+zip') {
          continue;
        }

        // 2) Find where the OPF file is placed.
        const container = await readAsStringAsync(
          `${handleUri}/META-INF/container.xml`,
        );
        const doc = new XMLParser({ ignoreAttributes: false }).parse(container);
        const {
          container: {
            rootfiles: {
              rootfile: { ['@_full-path']: pathToOpfFromRoot },
            },
          },
        } = doc;

        if (!(pathToOpfFromRoot as string).endsWith('.opf')) {
          continue;
        }

        // pathToOpfFromRoot is relative to the root of the EPUB, not relative
        // to container.xml nor the OPS directory.
        const absoluteUriToOPF = `${handleUri}/${pathToOpfFromRoot}`;
        const opfText = await readAsStringAsync(absoluteUriToOPF);

        // My EPUB 3 samples place all the resources into a folder named "OPS",
        // while my EPUB 2 samples place them at the root. The consistent thing
        // is that all the resources are in whatever folder the OPF file was in.
        const opsUri = absoluteUriToOPF.slice(
          0,
          // TODO: if this is Windows, work out whether expo-file-system should
          // return POSIX paths or Windows paths, and work out the dirname
          // accordingly.
          absoluteUriToOPF.lastIndexOf('/'),
        );

        const relativePathToOpfFromOps = absoluteUriToOPF
          .slice(opsUri.length)
          .replace(/^\/*/, '');

        const opf = await parseOPF(opfText);
        if (!opf) {
          continue;
        }

        const {
          package: {
            metadata: { titles },
            manifest: { items },
            spine: { itemrefs },
          },
        } = opf;

        // It's okay for this to be optional, as consumers downstream can fall
        // back to the folderName.
        const title = titles[0]?.textContent;

        const idref = itemrefs[0]?.idref;
        if (!idref) {
          continue;
        }

        const item = items.find(({ id }) => id === idref);
        if (!item) {
          continue;
        }

        library.push({
          type: 'opf',
          title,
          opsUri,
          folderName: handle,
          startingHref: item.href,
          relativePathToOpfFromOps,
        });
      } catch (error) {
        console.log(`Unable to parse epub at "${handleUri}". Skipping.`, error);
        continue;
      }
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

async function parseOPF(text: string) {
  const doc = new XMLParser({
    ignoreAttributes: false,
    alwaysCreateTextNode: true,
    textNodeName: 'textContent',
    isArray: (tagName, _jPath, _isLeafNode, isAttribute) => {
      if (isAttribute) {
        return false;
      }

      if (
        ['?xml', 'package', 'metadata', 'manifest', 'spine', 'guide'].includes(
          tagName,
        )
      ) {
        return false;
      }

      return true;
    },
  }).parse(text);

  // Parse <package>
  const {
    package: {
      '@_version': version,
      '@_unique-identifier': uniqueIdentifier,
      metadata,
      manifest: { item: items },
      spine: {
        '@_page-progression-direction': pageProgressionDirection,
        '@_toc': toc,
        itemref: itemrefs,
      },
      guide,
    },
  } = doc;

  /**
   * A lookup of the alias they used for each XML namespace.
   * @example
   * {
   *   "http://purl.org/dc/elements/1.1/": "dc",
   *   "http://www.idpf.org/2007/opf": "opf",
   * }
   */
  const namespaces: Record<string, string> = {};
  for (const key in metadata) {
    const [, alias] = key.split('@_xmlns:');
    if (!alias) {
      continue;
    }

    const uri = metadata[key];
    namespaces[uri] = alias;
  }

  const dc = namespaces['http://purl.org/dc/elements/1.1/'];
  const opf = namespaces['http://www.idpf.org/2007/opf'];

  const {
    [`${dc}:language`]: languages,
    [`${dc}:title`]: titles,
    [`${dc}:creator`]: creators,
    [`${dc}:contributor`]: contributors,
    [`${dc}:identifier`]: identifiers,
    [`${dc}:date`]: dates,
    [`${dc}:publisher`]: publishers,
    meta: metas,
  } = metadata;

  const payload: OPF = {
    package: {
      version,
      uniqueIdentifier,
      metadata: {
        languages: languages ?? [],
        titles: titles ?? [],
        creators:
          (creators as Array<any>)?.map(
            ({
              [`${opf}:file-as`]: opfFileAs,
              [`${opf}:role`]: opfRole,
              textContent,
            }) => ({
              opfFileAs,
              opfRole,
              textContent,
            }),
          ) ?? [],
        contributors: contributors ?? [],
        publishers: publishers ?? [],
        identifiers:
          (identifiers as Array<any>)?.map(
            ({ '@_id': id, [`${opf}:scheme`]: opfScheme, textContent }) => ({
              id,
              opfScheme,
              textContent,
            }),
          ) ?? [],
        dates: dates ?? [],
        metas:
          (metas as Array<any>)?.map(
            ({ '@_name': name, '@_content': content }) => ({ name, content }),
          ) ?? [],
      },
      manifest: {
        items:
          (items as Array<any>)?.map(
            ({ '@_id': id, '@_href': href, '@_media-type': mediaType }) => ({
              id,
              href,
              mediaType,
            }),
          ) ?? [],
      },
      spine: {
        toc,
        pageProgressionDirection,
        itemrefs:
          (itemrefs as Array<any>)?.map(({ '@_idref': idref }) => ({
            idref,
          })) ?? [],
      },
    },
  };

  // Parse optional <guide> section
  if (guide) {
    const references =
      (guide.reference as Array<any>)?.map(
        ({ '@_href': href, '@_title': title, '@_type': type }) => ({
          href,
          title,
          type,
        }),
      ) ?? [];
    payload.package.guide = { references };
  }

  return payload;
}

const LibraryContext = React.createContext<
  | { type: 'loading' }
  | {
      type: 'loaded';
      library: Array<Book>;
      setLibrary: React.Dispatch<React.SetStateAction<Book[]>>;
      libraryDir: string;
      setLibraryDir: React.Dispatch<React.SetStateAction<string>>;
    }
  | undefined
>(undefined);
