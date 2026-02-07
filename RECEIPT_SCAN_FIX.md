# Receipt Scan Fix - Image Upload Issue

## Problem
When users tried to scan receipts, they received the error:
```
Failed to download image from https://... 
Image downloaded contains no data. 
There may have been an error during upload.
```

## Root Cause
The issue was in the image upload flow in `src/app/add-receipt.tsx`:

1. **Original broken code:**
   ```js
   const response = await fetch(uri);  // file:// URI
   const blob = await response.blob();
   ```

2. **Why it failed:**
   - React Native's `fetch()` doesn't properly handle local `file://` URIs
   - Calling `.blob()` on a local file URI returns an empty or corrupted blob
   - The "upload" to Supabase Storage succeeded but contained 0 bytes
   - When OpenAI tried to download the image from the public URL, it got empty data

## Solution Implemented

### 1. Updated `src/lib/openai.ts`
- Modified `extractReceiptData()` to accept both URLs and base64 data URIs
- OpenAI Vision API supports `data:image/jpeg;base64,...` format directly
- This allows OCR without requiring a successful upload first

### 2. Fixed `src/app/add-receipt.tsx`
The new flow:
```js
// 1. Read image as base64 using expo-file-system
const base64 = await FileSystem.readAsStringAsync(uri, {
  encoding: FileSystem.EncodingType.Base64,
});

// 2. Create base64 data URI for OpenAI (no upload needed for OCR)
const base64DataUri = `data:image/jpeg;base64,${base64}`;

// 3. Extract receipt data using base64
const receiptData = await extractReceiptData(base64DataUri);

// 4. Convert base64 to ArrayBuffer for proper Supabase upload
const binaryString = atob(base64);
const bytes = new Uint8Array(binaryString.length);
for (let i = 0; i < binaryString.length; i++) {
  bytes[i] = binaryString.charCodeAt(i);
}

// 5. Upload to Supabase Storage with proper binary data
const { data, error } = await supabase.storage
  .from('receipts')
  .upload(fileName, bytes.buffer, {
    contentType: 'image/jpeg',
  });
```

### 3. Installed Required Package
```bash
npm install expo-file-system
```

## Benefits of This Fix

1. **OCR works immediately** - No dependency on upload success
2. **Proper binary upload** - Images are stored correctly in Supabase
3. **Better error handling** - OCR can succeed even if storage upload fails
4. **More reliable** - Uses native file system APIs instead of fetch()

## Testing
To test the fix:
1. Open the app and navigate to Add Receipt
2. Tap "Scan Receipt"
3. Take a photo of a receipt
4. Verify that:
   - The receipt details are extracted correctly
   - No error about "image contains no data"
   - The receipt is saved with the image URL

## Files Modified
- `src/lib/openai.ts` - Updated to support base64 images
- `src/app/add-receipt.tsx` - Fixed image upload using expo-file-system
- `package.json` - Added expo-file-system dependency
