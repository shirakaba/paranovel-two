Based on Expo's excellent [with-github-remote-build-cache-provider](https://github.com/expo/examples/tree/master/with-github-remote-build-cache-provider) example (no licence). All I've done is:

- convert the source to JavaScript (which avoids introducing a build step);
- source environment variables from your env files (which avoids having to prepare your CLI each time);
- namespace all console logs;
- add a `scripts/demo.js` file for developing `build-cache-provider` in isolation.
