# Flutter app: enable in-app calling in the WebView

The web app's calls use the microphone (WebRTC `getUserMedia`). Inside the
Flutter wrapper the WebView refuses microphone access unless the app grants it,
so calls fail with "Microphone permission is blocked" there, even though they
work in Chrome. Four changes are needed in the Flutter project.

## 1. OS permissions

`android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

`ios/Runner/Info.plist`:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Used for in-app calls with your driver or customer.</string>
```

## 2. Grant the WebView's permission request

Use whichever plugin the app already has (the web code supports both).

**flutter_inappwebview** (plus `permission_handler`):

```dart
InAppWebView(
  initialSettings: InAppWebViewSettings(
    mediaPlaybackRequiresUserGesture: false, // ringtone + remote audio
    allowsInlineMediaPlayback: true,         // iOS: play audio inline
  ),
  onPermissionRequest: (controller, request) async {
    final granted = await Permission.microphone.request().isGranted;
    return PermissionResponse(
      resources: request.resources,
      action: granted ? PermissionResponseAction.GRANT : PermissionResponseAction.DENY,
    );
  },
  // ...existing options
)
```

**webview_flutter** (4.x, plus `permission_handler`):

```dart
final params = WebViewPlatform.instance is WebKitWebViewPlatform
    ? WebKitWebViewControllerCreationParams(
        allowsInlineMediaPlayback: true,
        mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{},
      )
    : const PlatformWebViewControllerCreationParams();

final controller = WebViewController.fromPlatformCreationParams(
  params,
  onPermissionRequest: (request) async {
    final granted = await Permission.microphone.request().isGranted;
    granted ? request.grant() : request.deny();
  },
);

if (controller.platform is AndroidWebViewController) {
  (controller.platform as AndroidWebViewController)
      .setMediaPlaybackRequiresUserGesture(false);
}
```

## 3. The WebView must load the site over https

`getUserMedia` only works in a secure context. Load `https://searchmydrivers.com`,
never an `http://` URL.

## 4. Open the call when the "Incoming Call" push is tapped

The push has `data.type = "INCOMING_CALL"` and `data.url` (for example
`/driver/trip/<bookingId>`). On tap, load `https://searchmydrivers.com` + `data.url`
in the WebView (or just bring the WebView to the front). Once the page's socket
reconnects, it fetches the still-ringing call and shows the incoming-call
screen on its own. Calls ring for 40 seconds.

## Test

Driver app on one phone, customer on another. Call each way: with the app in
the foreground, in the background (tap the push), and after denying the mic
once (expect a clear error, then allow it in Settings).
