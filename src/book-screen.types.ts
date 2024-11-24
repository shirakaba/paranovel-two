import { Book } from '@/types/book.types';

export type BookScreenProps = Book & {
  href: string;
  /**
   * Needed in case the user has navigated away from params.href and we
   * need to force the WebView to re-render the same uri (due to the user
   * having navigated away from that uri, desyncing the React state).
   */
  navigationTimestamp: string;
};
