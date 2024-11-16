import { useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';

import type { Book } from '@/types/book.types';
import { SafeAreaView, StyleSheet } from 'react-native';
import { useLibrary } from '@/hooks/useLibrary';

export default function BookScreen() {
  const params = useLocalSearchParams<Book>();
  const library = useLibrary();

  if (library.type !== 'loaded') {
    return;
  }

  if (!params.folderUri) {
    return;
  }

  return (
    <SafeAreaView style={style.container}>
      <WebView
        webviewDebuggingEnabled={true}
        javaScriptEnabled={true}
        onMessage={() => true}
        // I wanted to use `injectedJavaScriptBeforeContentLoaded`, but
        // `document.head` is `null` at that time, and listening for readystate
        // events somehow doesn't work either, as they don't fire.
        injectedJavaScript={injectedJavaScript}
        allowFileAccessFromFileURLs={true}
        allowingReadAccessToURL={params.folderUri}
        // Specifying 'file://*' in here is necessary to stop the WebView from
        // treating file URLs as being blocklisted. Blocklisted URLs get opened
        // via Linking (to be passed on to Safari) instead.
        originWhitelist={['file://*']}
        source={{ uri: `${params.folderUri}/text/part0007.html` }}
      />
    </SafeAreaView>
  );
}

// Here, we insert a meta tag.
const injectedJavaScript = `
{
  const meta = document.createElement("meta");
  meta.name = "viewport";
  meta.content = "width=device-width, initial-scale=1";
  document.head.appendChild(meta);
}
`.trim();

const style = StyleSheet.create({
  container: { flex: 1 },
});
