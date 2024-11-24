import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { LibraryScreenProps } from './library-screen.types';
import type { BookScreenProps } from './book-screen.types';
import type { ToCScreenProps } from './toc-screen.types';

export type RootStackParamList = {
  Library: LibraryScreenProps;
  Book: BookScreenProps;
  ToC: ToCScreenProps;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
