import AVKit
import ExpoModulesCore

class OnkyouView: ExpoView {
  static var instances = NSMapTable<NSString, OnkyouView>.strongToWeakObjects()
  
  let player = AVPlayer()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    
    player.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 10), queue: DispatchQueue.main) { [weak self] time in
      let payload = ["currentTime": Double(CMTimeGetSeconds(time))]
      self?.onTimeupdate(payload)
    }
    player.addObserver(self, forKeyPath: "rate", options: NSKeyValueObservingOptions.new, context: nil)
    
    let audioSession = AVAudioSession.sharedInstance()
    do{
      try audioSession.setCategory(AVAudioSession.Category.playback)
    } catch {
      print("[OnkyouView] Failed to get permission to play in background")
    }
  }
  
  let onTimeupdate = EventDispatcher()
  let onLoadedmetadata = EventDispatcher()
  let onProgress = EventDispatcher()
  let onPlay = EventDispatcher()
  let onPlaying = EventDispatcher()
  let onPause = EventDispatcher()
  
  var instanceId: NSString = "" as NSString {
    didSet {
      OnkyouView.instances.setObject(self, forKey: instanceId as NSString)
    }
  }
  
  var autoplay: Bool = false
  
  var src: String = "" {
    didSet {
      guard src != "",
            let url = URL(string: src)
      else {
        return
      }
      
      player.currentItem?.removeObserver(self, forKeyPath: "status")
      player.currentItem?.removeObserver(self, forKeyPath: "loadedTimeRanges")

      
      player.replaceCurrentItem(with: AVPlayerItem(asset: AVURLAsset(url: url, options: [AVURLAssetPreferPreciseDurationAndTimingKey : true])))
      player.currentItem?.addObserver(self, forKeyPath: "status", options: [], context: nil)
      player.currentItem?.addObserver(self, forKeyPath: "loadedTimeRanges", options: [], context: nil)
    }
  }
  
  func getBuffered() -> [[String : Double]] {
    return player.currentItem?.loadedTimeRanges.map { value in
      [
        "start": Double(CMTimeGetSeconds(value.timeRangeValue.start)),
        "duration": Double(CMTimeGetSeconds(value.timeRangeValue.duration)),
      ]
    } ?? []
  }
  
  func play() {
    player.play()
    onPlay([:])
  }
  func pause() {
    player.pause()
    onPause([:])
  }
  
  // Implement the observer method to handle the status change
  override func observeValue(forKeyPath keyPath: String?, of object: Any?, change: [NSKeyValueChangeKey : Any]?, context: UnsafeMutableRawPointer?) {
    if keyPath == "status", let playerItem = object as? AVPlayerItem {
      if playerItem.status == .readyToPlay {
        print("[onLoadedmetadata] currentTime: \(Double(CMTimeGetSeconds(playerItem.currentTime()))); duration: \(Double(CMTimeGetSeconds(playerItem.duration))) (native)")
        onLoadedmetadata([
          // "isPaused": player.timeControlStatus == .paused,
          "currentTime": Double(CMTimeGetSeconds(playerItem.currentTime())),
          "duration": Double(CMTimeGetSeconds(playerItem.duration))
        ])
        if(autoplay){
          play()
        }
      }
      return
    }
    
    if keyPath == "loadedTimeRanges", ((object as? AVPlayerItem) != nil) {
      onProgress([
        "buffered": self.getBuffered()
      ])
      return
    }
    
    if keyPath == "rate" {
      if(player.rate != 0){
        onPlaying([:])
      }
      return
    }
  }
}
