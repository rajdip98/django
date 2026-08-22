package io.github.rajdip98.census2026;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Hands files to other apps without any storage permission.
 *
 * Two kinds of file pass through here: census exports the user chose to share,
 * and the temporary image the camera app writes when a house photograph is
 * taken. Both live in app-private external storage, so nothing is left behind
 * in the user's gallery or Downloads folder when the app is uninstalled — which
 * matters for data that is confidential under the Census Act.
 *
 * Not exported: callers only ever get access to the single URI they were
 * granted, and only for as long as the grant lasts.
 */
public final class ExportProvider extends ContentProvider {

    static final String AUTHORITY = "io.github.rajdip98.census2026.exports";

    private static final String SEGMENT_EXPORTS = "exports";
    private static final String SEGMENT_CAPTURE = "capture";

    static Uri exportUri(String fileName) {
        return Uri.parse("content://" + AUTHORITY + "/" + SEGMENT_EXPORTS + "/" + Uri.encode(fileName));
    }

    static Uri captureUri(String fileName) {
        return Uri.parse("content://" + AUTHORITY + "/" + SEGMENT_CAPTURE + "/" + Uri.encode(fileName));
    }

    /** Where exports are written. Also used by the activity when saving. */
    static File exportDir(Context context) {
        File dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) {
            dir = new File(context.getFilesDir(), SEGMENT_EXPORTS);
        }
        return dir;
    }

    /** Scratch space for a photograph the camera app is about to write. */
    static File captureDir(Context context) {
        File base = context.getExternalCacheDir();
        if (base == null) {
            base = context.getCacheDir();
        }
        return new File(base, SEGMENT_CAPTURE);
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    private File resolve(Uri uri, boolean mustExist) throws FileNotFoundException {
        Context context = getContext();
        if (context == null) {
            throw new FileNotFoundException("provider has no context");
        }

        String kind = uri.getPathSegments().isEmpty() ? null : uri.getPathSegments().get(0);
        String name = uri.getLastPathSegment();

        // Reject anything that could point outside the directory we own.
        if (name == null || name.isEmpty() || name.contains("/") || name.contains("..")) {
            throw new FileNotFoundException("invalid file name");
        }

        File dir;
        if (SEGMENT_EXPORTS.equals(kind)) {
            dir = exportDir(context);
        } else if (SEGMENT_CAPTURE.equals(kind)) {
            dir = captureDir(context);
        } else {
            throw new FileNotFoundException("unknown path: " + kind);
        }

        File file = new File(dir, name);
        if (mustExist && !file.isFile()) {
            throw new FileNotFoundException(name);
        }
        return file;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        boolean writing = mode != null && (mode.contains("w") || mode.contains("t") || mode.contains("a"));
        File file = resolve(uri, !writing);

        if (writing) {
            File parent = file.getParentFile();
            if (parent != null && !parent.exists() && !parent.mkdirs()) {
                throw new FileNotFoundException("could not create " + parent);
            }
        }
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.parseMode(mode == null ? "r" : mode));
    }

    @Override
    public String getType(Uri uri) {
        String name = uri.getLastPathSegment();
        if (name == null) {
            return "application/octet-stream";
        }
        String lower = name.toLowerCase();
        if (lower.endsWith(".csv")) return "text/csv";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".png")) return "image/png";
        return "application/octet-stream";
    }

    /**
     * Share targets ask for the display name and size before showing a preview;
     * without this they fall back to the opaque URI.
     */
    @Override
    public Cursor query(Uri uri, String[] projection, String selection,
                        String[] selectionArgs, String sortOrder) {
        final File file;
        try {
            file = resolve(uri, true);
        } catch (FileNotFoundException missing) {
            return null;
        }

        String[] columns = projection != null
                ? projection
                : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};

        MatrixCursor cursor = new MatrixCursor(columns, 1);
        Object[] row = new Object[columns.length];
        for (int i = 0; i < columns.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(columns[i])) {
                row[i] = file.getName();
            } else if (OpenableColumns.SIZE.equals(columns[i])) {
                row[i] = file.length();
            } else {
                row[i] = null;
            }
        }
        cursor.addRow(row);
        return cursor;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        throw new UnsupportedOperationException("read-only provider");
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("read-only provider");
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        try {
            return resolve(uri, true).delete() ? 1 : 0;
        } catch (FileNotFoundException missing) {
            return 0;
        }
    }
}
