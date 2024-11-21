import { type Href, Link } from 'expo-router';
import Ionicons from '@expo/vector-icons/Foundation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Button,
  useColorScheme,
  SafeAreaView,
} from 'react-native';
import { pickDirectory } from 'react-native-document-picker';

import { readLibrary, useLibrary } from '@/hooks/useLibrary';
import { makeBookmark } from '@/modules/bookmarks';
import type { Book } from '@/types/book.types';

export default function LibraryScreen() {
  const scheme = useColorScheme();
  const libraryStatus = useLibrary();

  const library = React.useMemo(
    () =>
      libraryStatus.type === 'loading'
        ? []
        : libraryStatus.library.sort((a, b) =>
            (a.title ?? a.folderName).localeCompare(b.title ?? b.folderName),
          ),
    [libraryStatus],
  );

  // Prompt the user to pick the directory where the novels are stored.
  const onPressPicker = React.useCallback(async () => {
    try {
      // Gives a percent-encoded URI.
      const result = await pickDirectory();
      if (!result) {
        return null;
      }

      let createdBookmark: string | null = null;
      try {
        createdBookmark = makeBookmark(result.uri);
        if (createdBookmark) {
          await AsyncStorage.setItem('novel_root', createdBookmark);
        }
      } catch (error) {
        console.error('Failed to make bookmark', error);
      }

      const library = await readLibrary(result.uri);
      if (library && libraryStatus.type === 'loaded') {
        libraryStatus.setLibrary(library);
        if (createdBookmark) {
          libraryStatus.setLibraryDir(createdBookmark);
        }
      }
    } catch (error) {
      if ((error as any).code === 'DOCUMENT_PICKER_CANCELED') {
        return null;
      }

      console.error('Error reading library', error);
    }
  }, []);

  return (
    <SafeAreaView
      style={[
        styles.container,
        scheme === 'dark'
          ? { backgroundColor: '#1E1E1E' }
          : { backgroundColor: 'white' },
      ]}>
      <Button
        disabled={libraryStatus.type !== 'loaded'}
        title="Select folder"
        onPress={onPressPicker}
      />

      <View style={styles.directory}>
        {library.map(book => {
          if (book.type !== 'opf') {
            return null;
          }

          return (
            <File
              key={book.title}
              href={{
                pathname: '/book',
                params: {
                  ...book,
                  href: `${book.opsUri}/${book.startingHref}`,
                  navigationTimestamp: `${Date.now()}`,
                },
              }}
              book={book}
            />
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function File({
  href,
  book: { title, opsUri, coverImage },
}: {
  href: Href;
  book: Book;
}) {
  const [isCoverImageLoaded, setIsCoverImageLoaded] = React.useState(false);
  const scheme = useColorScheme();

  const coverImageUri = coverImage ? `${opsUri}/${coverImage}` : '';

  return (
    <Link href={href}>
      <View
        style={[
          styles.file,
          scheme === 'dark'
            ? { backgroundColor: '#3B3B3D' }
            : { backgroundColor: '#E9E9EB' },
        ]}>
        {coverImageUri && (
          <Image
            style={[styles.coverImage, { opacity: isCoverImageLoaded ? 1 : 0 }]}
            source={{ uri: coverImageUri }}
            onLoad={() => {
              setIsCoverImageLoaded(true);
            }}
          />
        )}
        <Text
          style={[
            styles.fileTitle,
            scheme === 'dark' ? { color: '#E1E1E1' } : { color: '#242424' },
            { display: coverImageUri && isCoverImageLoaded ? 'none' : 'flex' },
          ]}>
          {title}
        </Text>
      </View>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    rowGap: 16,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  directory: {
    flex: 1,
    gap: 8,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  file: {
    flex: 0,
    height: 194,
    width: 137,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverImage: {
    height: '100%',
    width: '100%',
  },
  fileTitle: {
    fontSize: 20,
    textAlign: 'center',
  },
});
