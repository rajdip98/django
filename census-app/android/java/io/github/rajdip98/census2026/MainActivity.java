package io.github.rajdip98.census2026;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.util.List;

/**
 * The whole app: one Activity hosting a WebView that runs the census PWA from
 * the APK's own assets.
 *
 * Three things a plain WebView will not do on its own, and which the census
 * form depends on, are wired up here: geolocation (runtime permission handed
 * back to the page), the house-photograph file input (an intent to the camera
 * or the picker), and saving an export (a WebView cannot act on a blob:
 * download, so the page hands the bytes across a small bridge instead).
 */
public final class MainActivity extends Activity {

    private static final String TAG = "Census2026";
    private static final int REQ_FILE_CHOOSER = 1001;
    private static final int REQ_LOCATION = 1002;
    private static final long EXIT_WINDOW_MS = 2500;

    private WebView webView;
    private AssetServer assetServer;

    private ValueCallback<Uri[]> pendingFileCallback;
    private Uri pendingCameraUri;

    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin;

    private long lastBackPressAt;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        assetServer = new AssetServer(getAssets());
        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        configure(webView);
        setContentView(webView);

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(AssetServer.START_URL);
        }
    }

    private void configure(WebView view) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);      // localStorage
        settings.setDatabaseEnabled(true);        // IndexedDB backing store
        settings.setGeolocationEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(false);

        // The page is served from assets over https; it never needs file access,
        // and leaving these off closes the classic WebView file-theft holes.
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        // Lets the web app tell it is running inside the APK, so it can route
        // downloads through the bridge and skip service-worker registration.
        settings.setUserAgentString(settings.getUserAgentString() + " IndiaCensusApp/1.0");

        view.setWebViewClient(new CensusWebViewClient());
        view.setWebChromeClient(new CensusChromeClient());
        view.addJavascriptInterface(new ExportBridge(), "AndroidCensus");
        view.setBackgroundColor(0xFFFFFFFF);

        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Navigation                                                          */
    /* ------------------------------------------------------------------ */

    private final class CensusWebViewClient extends WebViewClient {

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return assetServer.serve(request.getUrl());
        }

        /**
         * Deprecated signature on purpose: the WebResourceRequest overload only
         * exists from API 24, and its default implementation delegates here, so
         * this one overload covers every supported version.
         */
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            Uri target = Uri.parse(url);
            if (AssetServer.isAppUrl(target)) {
                return false;   // our own page — let the WebView handle it
            }
            // Anything else is a real link; hand it to the browser rather than
            // letting it take over the app's window.
            try {
                Intent browse = new Intent(Intent.ACTION_VIEW, target);
                browse.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(browse);
            } catch (Exception unavailable) {
                Log.w(TAG, "no handler for " + url, unavailable);
            }
            return true;
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null) {
            if (webView.canGoBack()) {
                webView.goBack();
                return true;
            }
            // Two presses to leave: a stray back press mid-interview should not
            // drop the enumerator out of the app.
            long now = System.currentTimeMillis();
            if (now - lastBackPressAt > EXIT_WINDOW_MS) {
                lastBackPressAt = now;
                Toast.makeText(this, R.string.exit_hint, Toast.LENGTH_SHORT).show();
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Geolocation, camera and console                                     */
    /* ------------------------------------------------------------------ */

    private final class CensusChromeClient extends WebChromeClient {

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin,
                                                       GeolocationPermissions.Callback callback) {
            // Only the bundled app may ask for a fix.
            if (origin == null || !origin.startsWith(AssetServer.ORIGIN)) {
                callback.invoke(origin, false, false);
                return;
            }
            if (hasLocationPermission()) {
                callback.invoke(origin, true, false);
                return;
            }
            pendingGeoOrigin = origin;
            pendingGeoCallback = callback;
            requestPermissions(new String[]{
                    android.Manifest.permission.ACCESS_FINE_LOCATION,
                    android.Manifest.permission.ACCESS_COARSE_LOCATION
            }, REQ_LOCATION);
        }

        @Override
        public boolean onShowFileChooser(WebView view,
                                         ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            // A previous chooser that never returned would otherwise wedge the
            // file input for the rest of the session.
            if (pendingFileCallback != null) {
                pendingFileCallback.onReceiveValue(null);
            }
            pendingFileCallback = callback;
            pendingCameraUri = null;

            Intent picker;
            try {
                picker = params.createIntent();
            } catch (Exception unsupported) {
                picker = new Intent(Intent.ACTION_GET_CONTENT).setType("image/*");
            }

            Intent chooser = Intent.createChooser(picker, getString(R.string.choose_photo));
            Intent camera = buildCameraIntent();
            if (camera != null) {
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
            }

            try {
                startActivityForResult(chooser, REQ_FILE_CHOOSER);
                return true;
            } catch (Exception noActivity) {
                Log.w(TAG, "no file chooser available", noActivity);
                pendingFileCallback = null;
                callback.onReceiveValue(null);
                return false;
            }
        }
    }

    /**
     * An intent that lets the enumerator photograph the house directly.
     * Returns null when no camera app is installed, in which case the picker
     * alone is offered.
     */
    private Intent buildCameraIntent() {
        try {
            Intent capture = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            if (capture.resolveActivity(getPackageManager()) == null) {
                return null;
            }

            File dir = ExportProvider.captureDir(this);
            if (!dir.exists() && !dir.mkdirs()) {
                return null;
            }
            File target = new File(dir, "house-" + System.currentTimeMillis() + ".jpg");
            pendingCameraUri = ExportProvider.captureUri(target.getName());

            capture.putExtra(MediaStore.EXTRA_OUTPUT, pendingCameraUri);
            capture.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);

            // Grant flags on a chooser sub-intent are unreliable, so grant to
            // each camera app explicitly.
            List<ResolveInfo> handlers = getPackageManager()
                    .queryIntentActivities(capture, PackageManager.MATCH_DEFAULT_ONLY);
            for (ResolveInfo handler : handlers) {
                grantUriPermission(handler.activityInfo.packageName, pendingCameraUri,
                        Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }
            return capture;
        } catch (Exception unavailable) {
            Log.w(TAG, "camera unavailable", unavailable);
            pendingCameraUri = null;
            return null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE_CHOOSER) {
            return;
        }

        Uri[] results = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getData() != null) {
                results = new Uri[]{data.getData()};
            } else if (pendingCameraUri != null) {
                // The camera app writes straight to EXTRA_OUTPUT and returns no data.
                results = new Uri[]{pendingCameraUri};
            }
        }

        // Always answer, even with null: the file input stays disabled otherwise.
        if (pendingFileCallback != null) {
            pendingFileCallback.onReceiveValue(results);
            pendingFileCallback = null;
        }
        pendingCameraUri = null;
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode != REQ_LOCATION) {
            super.onRequestPermissionsResult(requestCode, permissions, grantResults);
            return;
        }

        boolean granted = false;
        for (int result : grantResults) {
            if (result == PackageManager.PERMISSION_GRANTED) {
                granted = true;
                break;
            }
        }

        if (pendingGeoCallback != null) {
            pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
        }
        if (!granted) {
            Toast.makeText(this, R.string.location_denied, Toast.LENGTH_LONG).show();
        }
    }

    /* ------------------------------------------------------------------ */
    /* Exports                                                             */
    /* ------------------------------------------------------------------ */

    /**
     * The page cannot save a file itself — a WebView ignores `<a download>` and
     * cannot fetch a blob: URL through the download manager — so it base64s the
     * bytes and calls across.
     */
    private final class ExportBridge {

        @JavascriptInterface
        public void saveFile(final String fileName, final String base64, final String mime) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    saveExport(fileName, base64, mime);
                }
            });
        }

        /** Lets the page confirm the bridge is really present. */
        @JavascriptInterface
        public String platform() {
            return "android-" + Build.VERSION.SDK_INT;
        }
    }

    private void saveExport(String fileName, String base64, String mime) {
        try {
            String safeName = sanitise(fileName);
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);

            File dir = ExportProvider.exportDir(this);
            if (!dir.exists() && !dir.mkdirs()) {
                throw new IllegalStateException("could not create " + dir);
            }

            File out = new File(dir, safeName);
            FileOutputStream stream = new FileOutputStream(out);
            try {
                stream.write(bytes);
                stream.flush();
            } finally {
                stream.close();
            }

            Toast.makeText(this, getString(R.string.saved_to, out.getName()), Toast.LENGTH_LONG).show();

            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
            send.putExtra(Intent.EXTRA_STREAM, ExportProvider.exportUri(out.getName()));
            send.putExtra(Intent.EXTRA_SUBJECT, out.getName());
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(send, getString(R.string.share_export)));
        } catch (Exception failed) {
            Log.e(TAG, "export failed", failed);
            Toast.makeText(this, R.string.save_failed, Toast.LENGTH_LONG).show();
        }
    }

    /** Keep a page-supplied name from escaping the export directory. */
    private static String sanitise(String fileName) {
        String name = fileName == null ? "" : fileName.trim();
        name = name.replaceAll("[^A-Za-z0-9._-]", "_");
        while (name.startsWith(".")) {
            name = name.substring(1);
        }
        if (name.isEmpty()) {
            name = "census-export";
        }
        return name.length() > 120 ? name.substring(0, 120) : name;
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
