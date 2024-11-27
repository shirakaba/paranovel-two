import { BookScreenProps } from './book-screen.types';

export type ToCScreenProps = {
  backParams: BookScreenProps;
  headerTitle: string;
  items: Array<{ href: string; label: string }>;
};
