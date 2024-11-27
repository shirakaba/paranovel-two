import { Book } from '@/types/book.types';

export type ToCScreenProps = Book & {
  headerTitle: string;
  hrefs: string;
  labels: string;
};
