import ExpoModulesCore

public class OnkyouModule: Module {
  // Each module class must implement the definition function. The definition consists of components
  // that describes the module's functionality and behavior.
  // See https://docs.expo.dev/modules/module-api for more details about available components.
  public func definition() -> ModuleDefinition {
    // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
    // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
    // The module will be accessible from `requireNativeModule('Onkyou')` in JavaScript.
    Name("Onkyou")

    // Defines event names that the module can send to JavaScript.

    Function("play") { (ref: String) in
      guard let instance = OnkyouView.instances.object(forKey: ref as NSString) else {
        return
      }

      instance.play()
    }
    Function("pause") { (ref: String) in
      guard let instance = OnkyouView.instances.object(forKey: ref as NSString) else {
        return
      }
      
      instance.pause()
    }
    Function("isPaused") { (ref: String) -> Bool in
      guard let instance = OnkyouView.instances.object(forKey: ref as NSString) else {
        return true
      }
      
      return instance.player.timeControlStatus == .paused
    }
    Function("getCurrentTime") { (ref: String) -> Double in
      guard let instance = OnkyouView.instances.object(forKey: ref as NSString) else {
        return -1
      }

      return Double(CMTimeGetSeconds(instance.player.currentTime()))
    }
    // Int on modern iOS and macOS is implicitly Int64.
    Function("setCurrentTime") { (ref: String, currentTime: Int) in
      guard let instance = OnkyouView.instances.object(forKey: ref as NSString) else {
        return
      }
      
      let to = CMTimeMake(value: Int64(currentTime), timescale: 1)
      
      instance.player.seek(to: to, toleranceBefore: CMTime.zero, toleranceAfter: CMTime.zero)
    }
    // Float64 is also known as Double.
    Function("getDuration") { (ref: String) -> Double in
      guard let instance = OnkyouView.instances.object(forKey: ref as NSString),
            let item = instance.player.currentItem else {
        return -1
      }

      return Double(CMTimeGetSeconds(item.duration))
    }
    Function("getBuffered") { (ref: String) -> [[String : Double]] in
      guard let instance = OnkyouView.instances.object(forKey: ref as NSString) else {
        return []
      }

      return instance.getBuffered()
    }

    // Defines a JavaScript function that always returns a Promise and whose native code
    // is by default dispatched on the different thread than the JavaScript runtime runs on.
    AsyncFunction("setValueAsync") { (value: String) in
      // Send an event to JavaScript.
      self.sendEvent("onChange", [
        "value": value
      ])
    }

    // Enables the module to be used as a native view. Definition components that are accepted as part of the
    // view definition: Prop, Events.
    // See: https://github.com/expo/expo/blob/41b5f63c8853844e214618a6b0f95e7685b072cb/packages/expo-image/ios/ImageModule.swift#L20
    View(OnkyouView.self) {
      Events("onTimeupdate", "onLoadedmetadata", "onProgress", "onPlay", "onPlaying", "onPause")
      Prop("src") { (view: OnkyouView, src: String) in
        view.src = src
      }
      Prop("autoplay") { (view: OnkyouView, autoplay: Bool) in
        view.autoplay = autoplay
      }
      Prop("instanceId") { (view: OnkyouView, instanceId: String) in
        view.instanceId = instanceId as NSString
      }
    }
  }
}
