import { Book } from '@/types/book.types';

export type BookScreenProps = Book & {
  /**
   * We'll load the last-stored page details for the book upon landing on the
   * book-screen page.
   */
  pageDetails: PageDetails;
};

export type PageDetails =
  | {
      pageType: 'toc';

      /**
       * The href the ebook should open at.
       *
       * Get the full URI for the starting page via `${opsUri}/${startingHref}`.
       *
       * @example "titlepage.xhtml"
       * @example "xhtml/表紙.xhtml"
       */
      href: string;

      label: string;

      blockScroll?: number;
    }
  | {
      pageType: 'spine' | 'other';

      /**
       * The href the ebook should open at.
       *
       * Get the full URI for the starting page via `${opsUri}/${startingHref}`.
       *
       * @example "titlepage.xhtml"
       * @example "xhtml/表紙.xhtml"
       */
      href: string;

      blockScroll?: number;
    }
  | {
      pageType: 'auto';
    };
