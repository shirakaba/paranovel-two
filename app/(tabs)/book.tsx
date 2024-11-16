import { useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';

import type { Book } from '@/types/book.types';
import { SafeAreaView, StyleSheet } from 'react-native';

export default function BookScreen() {
  const params = useLocalSearchParams<Book>();
  console.log('[book] params', params);

  if (params.type !== 'opf' || !params.folderName) {
    return null;
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
        source={{
          // uri: `http://localhost:3000/${params.folderName}/titlepage.xhtml`,
          uri: `http://localhost:3000/${params.folderName}/text/part0007.html`,
        }}
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
