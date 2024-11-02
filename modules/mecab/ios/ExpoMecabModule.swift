import ExpoModulesCore
import mecab_ko

public class ExpoMecabModule: Module {
  private static let locale = Locale(identifier: "ja") as CFLocale
  
  private static let jpBundlePath = Bundle.main.path(forResource: DEFAULT_JAPANESE_RESOURCES_BUNDLE_NAME, ofType: "bundle")
  private static let jpBundleResourcePath = Bundle.init(path: jpBundlePath!)!.resourcePath
  private static let mecabJapanese: Mecab = Mecab.init(dicDirPath: jpBundleResourcePath!)
  
  // Each module class must implement the definition function. The definition consists of components
  // that describes the module's functionality and behavior.
  // See https://docs.expo.dev/modules/module-api for more details about available components.
  public func definition() -> ModuleDefinition {
    // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
    // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
    // The module will be accessible from `requireNativeModule('ExpoMecab')` in JavaScript.
    Name("ExpoMecab")

    // Defines a JavaScript synchronous function that runs the native code on the JavaScript thread.
    Function("tokenize") { (text: String) -> [Token] in
      let nodes: [MecabNode] = ExpoMecabModule.mecabJapanese.parseToNode(with: text, calculateTrailingWhitespace: true) ?? Array<MecabNode>()
      
      return nodes.map {
        Token(
          surface: Field(wrappedValue: $0.surface),
          pronunciation: Field(wrappedValue: $0.features?[safe: 8]),
          lemma: Field(wrappedValue: $0.features?[safe: 6]),
          trailingWhitespace: Field(wrappedValue: $0.trailingWhitespace)
        )
      }
    }
  }
}

struct Token: Record {
  @Field
  var surface: String

  @Field
  var pronunciation: String?

  @Field
  var lemma: String?
  
  @Field
  var trailingWhitespace: String?
}

// TODO: move to main project or own module
extension Array {
  subscript(safe index: Int) -> Element? {
    guard indices.contains(index) else {
      return nil
    }
    return self[index]
  }
}
