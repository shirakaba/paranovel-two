import { type Href, Link } from 'expo-router';
import Ionicons from '@expo/vector-icons/Foundation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import {
  View,
  Text,
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
  const libraryStatus = useLibrary();
  const library = libraryStatus.type === 'loading' ? [] : libraryStatus.library;

  // Prompt the user to pick the directory where the novels are stored.
  const onPressPicker = React.useCallback(async () => {
    try {
      // Gives a percent-encoded URI.
      const result = await pickDirectory();
      if (!result) {
        return null;
      }

      try {
        const createdBookmark = makeBookmark(result.uri);
        if (createdBookmark) {
          await AsyncStorage.setItem('novel_root', createdBookmark);
        }
      } catch (error) {
        console.error('Failed to make bookmark', error);
      }

      const library = await readLibrary(result.uri);
      if (library && libraryStatus.type === 'loaded') {
        libraryStatus.setLibrary(library);
      }
    } catch (error) {
      if ((error as any).code === 'DOCUMENT_PICKER_CANCELED') {
        return null;
      }

      console.error('Error reading library', error);
    }
  }, []);

  return (
    <SafeAreaView style={styles.container}>
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
              href={{ pathname: '/book', params: book }}
              book={book}
            />
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function File({ href, book: { title } }: { href: Href; book: Book }) {
  const scheme = useColorScheme();

  return (
    <Link href={href}>
      <View style={styles.file}>
        <Ionicons
          color={scheme === 'dark' ? 'white' : 'black'}
          name={'book'}
          size={64}
        />
        <Text
          style={[
            styles.fileTitle,
            { color: scheme === 'dark' ? 'white' : 'black' },
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
    // backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  directory: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  file: {
    flex: 0,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  fileTitle: {
    // color: 'white',
    // backgroundColor: 'rgba(0,0,0,0.4)',
    // borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    overflow: 'hidden',
  },
});
