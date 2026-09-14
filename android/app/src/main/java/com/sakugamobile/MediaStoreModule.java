package com.sakugamobile;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;

public class MediaStoreModule extends ReactContextBaseJavaModule {
  MediaStoreModule(ReactApplicationContext context) {
    super(context);
  }

  @NonNull
  @Override
  public String getName() {
    return "SakugaMediaStore";
  }

  @ReactMethod
  public void saveToDownloads(String sourcePath, String displayName, String mimeType, Promise promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      promise.reject("UNSUPPORTED_ANDROID_VERSION", "MediaStore saving requires Android 10 or newer");
      return;
    }

    ContentResolver resolver = getReactApplicationContext().getContentResolver();
    ContentValues values = new ContentValues();
    values.put(MediaStore.Downloads.DISPLAY_NAME, displayName);
    values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Sakuga Mobile Fork");
    values.put(MediaStore.Downloads.IS_PENDING, 1);
    Uri uri = null;

    try {
      File source = new File(sourcePath);
      if (!source.isFile() || source.length() == 0) {
        throw new IllegalArgumentException("Source media is missing or empty");
      }
      uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
      if (uri == null) {
        throw new IllegalStateException("Could not create Downloads item");
      }
      try (FileInputStream input = new FileInputStream(source);
           OutputStream output = resolver.openOutputStream(uri)) {
        if (output == null) {
          throw new IllegalStateException("Could not open Downloads item");
        }
        byte[] buffer = new byte[8192];
        int count;
        while ((count = input.read(buffer)) != -1) {
          output.write(buffer, 0, count);
        }
      }
      values.clear();
      values.put(MediaStore.Downloads.IS_PENDING, 0);
      resolver.update(uri, values, null, null);
      promise.resolve(uri.toString());
    } catch (Exception error) {
      if (uri != null) {
        resolver.delete(uri, null, null);
      }
      promise.reject("SAVE_FAILED", error);
    }
  }
}
