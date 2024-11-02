import ExpoModulesCore

public class BookmarksModule: Module {
  // Each module class must implement the definition function. The definition consists of components
  // that describes the module's functionality and behavior.
  // See https://docs.expo.dev/modules/module-api for more details about available components.
  public func definition() -> ModuleDefinition {
    // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
    // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
    // The module will be accessible from `requireNativeModule('Bookmarks')` in JavaScript.
    Name("Bookmarks")

    // Defines a JavaScript synchronous function that runs the native code on the JavaScript thread.
    Function("makeBookmark") { (urlStr: String) -> String? in
      guard let url = URL(string: urlStr) else {
        return nil
      }

      do {
        // Start accessing a security-scoped resource.
        guard url.startAccessingSecurityScopedResource() else {
          // Handle the failure here.
          return nil
        }

        // Make sure you release the security-scoped resource when you finish.
        defer { url.stopAccessingSecurityScopedResource() }
        
        let bookmarkData = try url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil)
        
        // It can write into the directory, creating a file called 'bookmark'.
        // try bookmarkData.write(to: url)
        
        return bookmarkData.base64EncodedString()
      }
      catch let error {
        // Handle the error here.
        print(error.localizedDescription)
      }

      return nil
    }

    Function("readBookmark") { (base64Str: String) -> String? in
      do {
        // let bookmarkData = try Data(contentsOf: URL(string: "")!)
        guard let bookmarkData = Data(base64Encoded: base64Str) else {
          print("Unable to decode bookmarkData")
          return nil
        }
        var isStale = false
        let url = try URL(resolvingBookmarkData: bookmarkData, bookmarkDataIsStale: &isStale)
        
        guard !isStale else {
          print("Bookmark was stale")
          return nil
        }
        
        return url.absoluteString
      }
      catch let error {
        // Handle the error here.
        print(error.localizedDescription)
      }

      return nil
    }
  }
}
