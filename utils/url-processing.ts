import * as kleur from 'kleur/colors';

export function makeUrlFromOps({
  opsUri,
  pageHref,
  params: { blockScroll },
}: {
  opsUri: string;
  pageHref: string;
  params: {
    blockScroll?: number;
  };
}) {
  // To explain the odd URL-processing we do below:
  //
  // - `new URL()` normalises to encoded (so anything that's already encoded
  //    doesn't get doubly encoded).
  // - `encodeURI()` adds one layer of encoding. On certain books (e.g.
  //   Bookworm), it works for us while `new URL()` doesn't.
  //   - Specifically, when we try `new URL()`, we get the following in Xcode:
  //     > 0x17b0180c0 - [PID=4363] WebProcessProxy::checkURLReceivedFromWebProcess: Received an unexpected URL from the web process
  //     > 0x10bdfd618 - [pageProxyID=13, webPageID=14, PID=4363] WebPageProxy::Ignoring request to load this main resource because it is outside the sandbox
  // - Both `params.opsUri` and `pageDetailsQuery.data.href` are unencoded.
  // - However, after we pass the URL to react-native-webview, at the point of
  //   use (i.e. `visitSource` > `syncCookiesToWebView` in RNCWebViewImpl.m),
  //   it processes it with `[RCTConvert NSURL:allowingReadAccessToURL]`
  //   before handing it over to `loadFileURL:allowingReadAccessToURL:`.
  // - The RCTConvert part runs `[NSURL URLWithString:path]` on it, which
  //   normalises it as encoded, without doubly-encoding it.
  // - This means that the URL that comes back through
  //   `onShouldStartLoadWithRequest` may not match the `webViewUri` we set,
  //   due to encoding differences.
  // - If it doesn't match, our navigation ends up thrashing, due to the
  //   desync between React state and native state.
  // - So, to keep React state in sync with native state, we need to either:
  //   1. render a URL that won't be changed by RCTConvert, or;
  //   2. match the native RCTConvert algorithm inside our
  //      `onShouldStartLoadWithRequest` JavaScript callback.
  // - In practice, we do both. Here, we render a definitely-encoded URI, and
  //   in our `onShouldStartLoadWithRequest` JavaScript callback, we compare
  //   URLs using `new URL()`, both with and without params.

  // As established, `encodeURI()` seems to support our books better than
  // `new URL()`, but the latter is still the best tool to extract any
  // existing search params.
  const { searchParams } = new URL(pageHref, opsUri);
  if (blockScroll) {
    searchParams.append('scroll', blockScroll.toString());
  }
  const paramsString = searchParams.size ? `?${searchParams.toString()}` : '';

  return encodeURI(`${opsUri}/${pageHref}${paramsString}`);
}

export function prettifyOpsUrl({
  url,
  opsUri,
  color,
}: {
  url: string;
  opsUri: string;
  color:
    | 'black'
    | 'red'
    | 'green'
    | 'yellow'
    | 'blue'
    | 'magenta'
    | 'cyan'
    | 'white'
    | 'gray'
    | 'grey';
}) {
  return `"…${kleur[color](url.replace(encodeURI(opsUri), ''))}"`;
}
