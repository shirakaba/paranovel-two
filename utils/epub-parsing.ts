import { XMLParser } from 'fast-xml-parser';
import type { OPF, NCX } from '@/types/epub.types';
import { MainFeaturesFromOPF } from '@/types/book.types';

// TODO: Read the Kindle guide to self-publishing to see recommendations for
// structure and contents of the epub:
// https://kdp.amazon.com/en_US/help/topic/GY3AD8C6C6GAG42N

export function getMainFeaturesFromOpf(
  opf: OPF,
): MainFeaturesFromOPF | undefined {
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
    return;
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

  let ncxFileHref: string | undefined;
  if (toc) {
    const ncxFile = items.find(
      ({ id, mediaType }) =>
        id === toc && mediaType === 'application/x-dtbncx+xml',
    );

    ncxFileHref = ncxFile?.href;
  }

  const item = items.find(({ id }) => id === idref);
  if (!item) {
    return;
  }

  return {
    title,
    coverImage: coverItem?.href,
    nav: navItem?.href,
    startingHref: item.href,
    ncxFileHref,
  };
}

export function getSpineFromOpf({ opf, nav }: { opf: OPF; nav?: string }) {
  const {
    package: {
      manifest: { items },
      spine: { itemrefs },
    },
  } = opf;

  // To be expanded to: `${backParams.opsUri}/${href}`
  const spineItems = new Array<{ href: string; label: string }>();

  if (nav) {
    spineItems.push({ href: nav, label: 'Nav' });
  }

  let i = 0;
  for (const { idref } of itemrefs) {
    const item = items.find(item => item.id === idref);
    if (!item || item.href === nav) {
      continue;
    }
    spineItems.push({ href: item.href, label: `Part ${i}` });
    i++;
  }

  return spineItems;
}

export function getTocFromNCX({
  ncx,
  ncxFileHref,
}: {
  ncx: NCX;
  ncxFileHref: string;
}) {
  const {
    root: {
      navMap: { navPoints },
    },
  } = ncx;

  // The values for src in the toc.ncx file seem to be relative to the toc.ncx
  // file itself. So here we work out the dirname to prepend it before the href.
  const ncxDir = ncxFileHref.slice(
    0,
    // TODO: work out how to normalise paths for Windows
    ncxFileHref.lastIndexOf('/'),
  );

  // To be expanded to: `${backParams.opsUri}/${href}`
  return navPoints
    .sort((a, b) => a.playOrder - b.playOrder)
    .map(({ navLabel, src }) => ({
      href: `${ncxDir}/${src}`,
      label: navLabel,
    }));
}

export function parseOPF(text: string) {
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

export function parseNCX(text: string) {
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
          'content',
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
      navLabel: navLabelTextContent,
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
