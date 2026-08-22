package io.github.rajdip98.census2026;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceResponse;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Serves the bundled web app out of the APK's assets.
 *
 * The app is loaded from {@code https://census.localhost} rather than
 * {@code file:///android_asset/...} on purpose. A file:// page is an opaque
 * origin, which modern WebView treats as insecure — geolocation is refused and
 * the census form could never geo-tag a household. Answering an https origin
 * from assets gives the page a real, secure origin while never touching the
 * network. `.localhost` is reserved by RFC 6761, so even a request that somehow
 * escaped interception could not leave the device.
 */
final class AssetServer {

    static final String HOST = "census.localhost";
    static final String ORIGIN = "https://" + HOST;
    static final String START_URL = ORIGIN + "/index.html";

    /** Assets are packaged under assets/www by the build script. */
    private static final String ROOT = "www";

    private static final Map<String, String> MIME_TYPES = new HashMap<String, String>();

    static {
        MIME_TYPES.put("html", "text/html");
        MIME_TYPES.put("js", "text/javascript");
        MIME_TYPES.put("mjs", "text/javascript");
        MIME_TYPES.put("css", "text/css");
        MIME_TYPES.put("json", "application/json");
        MIME_TYPES.put("webmanifest", "application/manifest+json");
        MIME_TYPES.put("svg", "image/svg+xml");
        MIME_TYPES.put("png", "image/png");
        MIME_TYPES.put("jpg", "image/jpeg");
        MIME_TYPES.put("jpeg", "image/jpeg");
        MIME_TYPES.put("webp", "image/webp");
        MIME_TYPES.put("ico", "image/x-icon");
        MIME_TYPES.put("woff", "font/woff");
        MIME_TYPES.put("woff2", "font/woff2");
        MIME_TYPES.put("ttf", "font/ttf");
        MIME_TYPES.put("txt", "text/plain");
    }

    private final AssetManager assets;

    AssetServer(AssetManager assets) {
        this.assets = assets;
    }

    /** True when this URL belongs to the bundled app rather than the network. */
    static boolean isAppUrl(Uri url) {
        return url != null && HOST.equals(url.getHost());
    }

    /**
     * Answer a request from assets, or return null to let the WebView load it
     * normally — which is how the app still reaches a remote census server.
     */
    WebResourceResponse serve(Uri url) {
        if (!isAppUrl(url)) {
            return null;
        }

        String path = normalise(url.getPath());
        if (path == null) {
            return error(400, "Bad Request");
        }

        try {
            InputStream stream = assets.open(ROOT + "/" + path);
            Map<String, String> headers = new HashMap<String, String>();
            // Hashed asset names are immutable; the shell must always revalidate
            // so an app update is picked up on the next launch.
            headers.put("Cache-Control", path.startsWith("assets/")
                    ? "public, max-age=31536000, immutable"
                    : "no-cache");
            return new WebResourceResponse(
                    mimeFor(path), "utf-8", 200, "OK", headers, stream);
        } catch (IOException notFound) {
            return error(404, "Not Found");
        }
    }

    /**
     * Map a URL path to an asset path, refusing anything that tries to climb
     * out of the asset root.
     */
    private static String normalise(String rawPath) {
        String path = rawPath == null ? "" : rawPath;
        while (path.startsWith("/")) {
            path = path.substring(1);
        }
        if (path.isEmpty()) {
            path = "index.html";
        }
        if (path.contains("..") || path.contains("\\") || path.contains("//")) {
            return null;
        }
        return path;
    }

    private static String mimeFor(String path) {
        int dot = path.lastIndexOf('.');
        if (dot < 0 || dot == path.length() - 1) {
            return "application/octet-stream";
        }
        String extension = path.substring(dot + 1).toLowerCase();
        String mime = MIME_TYPES.get(extension);
        return mime == null ? "application/octet-stream" : mime;
    }

    private static WebResourceResponse error(int status, String reason) {
        return new WebResourceResponse(
                "text/plain",
                "utf-8",
                status,
                reason,
                new HashMap<String, String>(),
                null);
    }
}
