export type OPF = {
  package: {
    version: string;
    uniqueIdentifier: string;
    metadata: {
      languages: Array<{ textContent: string }>;
      titles: Array<{ textContent: string }>;
      creators: Array<{
        textContent: string;
        opfFileAs: string;
        opfRole: string;
      }>;
      contributors: Array<{ textContent: string }>;
      publishers: Array<{ textContent: string }>;
      identifiers: Array<{
        textContent: string;
        id: string;
        opfScheme: string;
      }>;
      dates: Array<{ textContent: string }>;
      metas: Array<{ name: string; content: string }>;
    };
    manifest: {
      items: Array<{
        id: string;
        href: string;
        mediaType?: string;
        mediaOverlay?: string;
        properties?: string;
      }>;
    };
    spine: {
      toc?: string;
      pageProgressionDirection: 'ltr' | 'rtl';
      itemrefs: Array<{ idref: string; linear?: 'yes' | 'no' }>;
    };
    guide?: {
      references: Array<{
        type: 'text' | 'toc' | 'cover';
        href: string;
        title: string;
      }>;
    };
  };
};

export type NCX = {
  root: {
    head: {
      uid?: string;
      depth?: number;
      totalPageCount?: number;
      maxPageNumber?: number;
    };
    docTitle?: string;
    docAuthor?: string;
    navMap: {
      navPoints: Array<{
        id: string;
        playOrder: number;
        navLabel: string;
        src: string;
      }>;
    };
  };
};
