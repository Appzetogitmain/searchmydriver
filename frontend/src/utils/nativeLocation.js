/**
 * A web page can't switch the phone's GPS on by itself — only the native app
 * that wraps this site can, by showing Android's one-tap "Turn on location?"
 * dialog (Google Play Services SettingsClient / LocationSettingsRequest).
 *
 * This asks the wrapper to do that through whichever JS bridge it exposes.
 * Every bridge is called with the same name, `enableLocation`, so the native
 * side only needs to implement that one handler.
 *
 * Returns true when a native bridge was found and asked, false otherwise
 * (plain browser / PWA — the caller falls back to the browser flow).
 */
export function requestNativeLocationOn() {
  if (typeof window === 'undefined') return false;
  try {
    // Flutter — flutter_inappwebview: addJavaScriptHandler('enableLocation')
    if (window.flutter_inappwebview?.callHandler) {
      window.flutter_inappwebview.callHandler('enableLocation');
      return true;
    }
    // Flutter — webview_flutter: JavaScriptChannel named 'EnableLocation'
    if (window.EnableLocation?.postMessage) {
      window.EnableLocation.postMessage('enableLocation');
      return true;
    }
    // React Native — react-native-webview onMessage
    if (window.ReactNativeWebView?.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'enableLocation' }));
      return true;
    }
    // Native Android — addJavascriptInterface(obj, 'Android') with @JavascriptInterface enableLocation()
    if (typeof window.Android?.enableLocation === 'function') {
      window.Android.enableLocation();
      return true;
    }
  } catch {
    // Bridge threw — fall back to the browser flow.
  }
  return false;
}
