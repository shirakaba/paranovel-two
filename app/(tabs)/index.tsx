import Ionicons from '@expo/vector-icons/Foundation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { readDirectoryAsync } from 'expo-file-system';
import * as React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Button,
  Pressable,
  useColorScheme,
  SafeAreaView,
} from 'react-native';
import { pickDirectory } from 'react-native-document-picker';

import { makeBookmark, readBookmark } from '../../modules/bookmarks';

type Ingredients = any;

export default function LibraryScreen() {
  const [library, setLibrary] = React.useState<Ingredients[]>([]);

  // Check whether we've got an already-saved directory where the novels are
  // stored.
  const query = useQuery({
    queryKey: ['checkExistingNovelDirectory'],
    queryFn: async () => {
      const clearNovelRoot = () =>
        AsyncStorage.removeItem('novel_root').catch(error => {
          console.error('Failed to clear novel_root', error);
        });

      try {
        const novelRoot = await AsyncStorage.getItem('novel_root');
        if (!novelRoot) {
          return false;
        }
        const bookmark = readBookmark(novelRoot);
        if (!bookmark) {
          console.log('No existing novel directory.');
          await clearNovelRoot();
          return false;
        }

        console.log(`Reading existing novel directory: ${bookmark}`);
        const library = await readLibrary(bookmark);
        if (library) {
          setLibrary(library);
        }
        return true;
      } catch (error) {
        console.error('Failed to populate from persisted bookmark', error);

        await clearNovelRoot();
      }

      return false;
    },
  });

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
      if (library) {
        setLibrary(library);
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
        disabled={!query.isFetched}
        title="Select folder"
        onPress={onPressPicker}
      />

      <View style={styles.directory}>
        {library.map(ingredients => {
          return (
            <File
              key={ingredients.title}
              onPress={() => {
                // navigation.navigate('Novel', { ingredients })
              }}
              ingredients={ingredients}
            />
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function File({
  onPress,
  ingredients: { title },
}: {
  onPress: () => void;
  ingredients: Ingredients;
}) {
  const scheme = useColorScheme();

  return (
    <Pressable onPress={onPress}>
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
    </Pressable>
  );
}

async function readLibrary(directoryPath: string) {
  // The path will have come from the file picker, and so is percent-encoded.
  directoryPath = directoryPath.replace(/\/*$/, '');
  console.log('DirectoryPath:', directoryPath);

  try {
    // readDirectoryAsync can take raw or percent-encoded paths as input, but
    // always outputs file/folder names as raw.
    const handles = await readDirectoryAsync(directoryPath);
    console.log('handles:', handles);

    const library: Ingredients[] = [];
    for (const handle of handles) {
      const subdir = `${directoryPath}/${encodeURIComponent(handle)}`;
      const subhandles = await readDirectoryAsync(subdir);
      console.log('reading directory:', subdir, subhandles);

      const lines = subhandles.find(subhandle => subhandle.endsWith('.txt'));
      const audio = subhandles.find(subhandle => subhandle.endsWith('.mp3'));
      const alignment = subhandles.find(subhandle =>
        subhandle.endsWith('.tsv'),
      );
      if (!lines || !audio || !alignment) {
        continue;
      }

      library.push({
        title: handle,
        linesTXT: `${subdir}/${encodeURIComponent(lines)}`,
        audiobookMP3: `${subdir}/${encodeURIComponent(audio)}`,
        alignmentsTSV: `${subdir}/${encodeURIComponent(alignment)}`,
      });
    }

    return library;
  } catch (error) {
    if ((error as any).code === 'DOCUMENT_PICKER_CANCELED') {
      return null;
    }

    console.error('Error reading library', error);
  }

  return null;
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
