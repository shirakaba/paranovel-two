import * as React from 'react';
import { readBookmark } from '@/modules/bookmarks';
import type { Book } from '@/types/book.types';
import type { NCX, OPF } from '@/types/epub.types';
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

        const opf = parseOPF(opfText);
        if (!opf) {
          continue;
        }

        const {
          package: {
            metadata: { titles, metas },
            manifest: { items },
            spine: { itemrefs, toc },
          },
        } = opf;

        // It's okay for this to be optional, as consumers downstream can fall
        // back to the folderName.
        const title = titles[0]?.textContent;

        const idref = itemrefs[0]?.idref;
        if (!idref) {
          continue;
        }

        let coverItem = items.find(
          ({ properties, mediaType }) =>
            properties?.split(/\s+/).includes('cover-image') &&
            mediaType?.startsWith('image/'),
        );
        if (!coverItem) {
          // Off-spec, but common.
          const name = metas.find(({ content }) => content === 'cover')?.name;
          if (name) {
            coverItem = items.find(({ id }) => id === name);
          }
        }
        if (!coverItem) {
          coverItem = items.find(({ id }) => id === 'cover');
        }

        let navItem = items.find(
          ({ properties, mediaType }) =>
            properties?.split(/\s+/).includes('nav') &&
            mediaType === 'application/xhtml+xml',
        );
        if (!navItem) {
          // Off-spec, and haven't seen any example of this yet, just mirrorring
          // what we did with cover items.
          const name = metas.find(({ content }) => content === 'nav')?.name;
          if (name) {
            navItem = items.find(({ id }) => id === name);
          }
        }
        if (!navItem) {
          navItem = items.find(({ id }) => id === 'nav');
        }

        if (toc) {
          const ncxFile = items.find(
            ({ id, mediaType }) =>
              id === toc && mediaType === 'application/x-dtbncx+xml',
          );

          if (ncxFile?.href) {
            const absoluteUriToNCX = `${opsUri}/${ncxFile.href}`;
            if (absoluteUriToNCX.includes('kusamakura')) {
              const ncxText = await readAsStringAsync(absoluteUriToNCX);
              parseNCX(ncxText);
              // TODO: pass along NCX
            }
          }
        }

        const item = items.find(({ id }) => id === idref);
        if (!item) {
          continue;
        }

        library.push({
          type: 'opf',
          title,
          opsUri,
          coverImage: coverItem?.href,
          nav: navItem?.href,
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

function parseNCX(text: string) {
  const doc = new XMLParser({
    ignoreAttributes: false,
    alwaysCreateTextNode: true,
    textNodeName: 'textContent',
    isArray: (tagName, _jPath, _isLeafNode, isAttribute) => {
      if (isAttribute) {
        return false;
      }

      // Sometimes these tags are namespaced, sometimes they're not.
      const tagWithoutNamespace = tagName.split(':').slice(-1)[0];

      if (
        [
          '?xml',
          'ncx',
          'head',
          'docTitle',
          'docAuthor',
          'navMap',
          'navLabel',
          'text',
        ].includes(tagWithoutNamespace)
      ) {
        return false;
      }

      return true;
    },
  }).parse(text);

  const { ['?xml']: xml, ...rest } = doc;

  const rootTag = Object.keys(rest ?? {}).find(tagName => {
    const tagWithoutNamespace = tagName.split(':').slice(-1)[0];
    return tagWithoutNamespace === 'ncx';
  });

  if (!rootTag) {
    return null;
  }

  const root = rest[rootTag];

  /**
   * A lookup of the alias they used for each XML namespace.
   * @example
   * {
   *   "http://www.daisy.org/z3986/2005/ncx/": "ncx",
   * }
   */
  const namespaces: Record<string, string> = {};
  for (const key in root) {
    const [, alias] = key.split('@_xmlns:');
    if (!alias) {
      continue;
    }

    const uri = root[key];
    namespaces[uri] = alias;
  }

  // The kusamakura-japanese-vertical-writing sample used this namespace with
  // all elements in the NCX, while other published ebooks didn't at all.
  const daisyNamespace = 'http://www.daisy.org/z3986/2005/ncx/';
  let namespace = namespaces[daisyNamespace]
    ? `${namespaces[daisyNamespace]}:`
    : '';

  const {
    [`${namespace}head`]: head,
    [`${namespace}docTitle`]: docTitle,
    [`${namespace}docAuthor`]: docAuthor,
    [`${namespace}navMap`]: navMap,
  } = root;

  const metas: Array<any> = head?.[`${namespace}meta`] ?? [];
  const docTitleTextContent = docTitle?.[`${namespace}text`]?.textContent;
  const docAuthorTextContent = docAuthor?.[`${namespace}text`]?.textContent;

  const uid: string | undefined = metas.find(
    ({ '@_name': name }) => name === 'dtb:uid' || name === 'uid',
  )?.['@_content'];
  const depth: string | undefined = metas.find(
    ({ '@_name': name }) => name === 'dtb:depth' || name === 'depth',
  )?.['@_content'];
  const totalPageCount: string | undefined = metas.find(
    ({ '@_name': name }) =>
      name === 'dtb:totalPageCount' || name === 'totalPageCount',
  )?.['@_content'];
  const maxPageNumber: string | undefined = metas.find(
    ({ '@_name': name }) =>
      name === 'dtb:maxPageNumber' || name === 'maxPageNumber',
  )?.['@_content'];

  const navPoints: Array<any> = navMap?.[`${namespace}navPoint`] ?? [];

  const navPointsParsed = new Array<
    NCX['root']['navMap']['navPoints'][number]
  >();
  for (const {
    '@_id': id,
    '@_playOrder': playOrder,
    [`${namespace}navLabel`]: navLabel,
    [`${namespace}content`]: content,
  } of navPoints) {
    if (!id || !playOrder || !navLabel || !content) {
      continue;
    }

    const navLabelTextContent = navLabel[`${namespace}text`]?.textContent;
    const { ['@_src']: src } = content;

    if (!src || !navLabelTextContent) {
      continue;
    }

    navPointsParsed.push({
      id,
      playOrder: parseInt(playOrder),
      navLabel,
      src,
    });
  }

  const payload: NCX = {
    root: {
      head: {
        uid,
        depth: depth ? parseInt(depth) : undefined,
        totalPageCount: totalPageCount ? parseInt(totalPageCount) : undefined,
        maxPageNumber: maxPageNumber ? parseInt(maxPageNumber) : undefined,
      },
      docTitle: docTitleTextContent,
      docAuthor: docAuthorTextContent,
      navMap: {
        navPoints: navPointsParsed,
      },
    },
  };

  return payload;
}

function parseOPF(text: string) {
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
            ({
              '@_id': id,
              '@_href': href,
              '@_media-type': mediaType,
              '@_media-overlay': mediaOverlay,
              '@_properties': properties,
            }) => ({
              id,
              href,
              mediaType,
              mediaOverlay,
              properties,
            }),
          ) ?? [],
      },
      spine: {
        toc,
        pageProgressionDirection,
        itemrefs:
          (itemrefs as Array<any>)?.map(
            ({ '@_idref': idref, '@_linear': linear }) => ({
              idref,
              linear,
            }),
          ) ?? [],
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
