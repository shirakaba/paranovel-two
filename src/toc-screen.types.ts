import { BookScreenProps, PageDetails } from './book-screen.types';

export type ToCScreenProps = {
  backParams: BookScreenProps;
  pageType: Extract<PageDetails['pageType'], 'toc' | 'spine'>;
  items: Array<{ href: string; label: string }>;
};
