import path from 'path';
import fs from 'fs';
import { FileUploadConstraint, UploadValidationResult } from './types';

// Standard constraints for bill uploads
export const BILL_UPLOAD_CONSTRAINTS: FileUploadConstraint = {
  maxSizeBytes: 25 * 1024 * 1024, // 25 MB
  allowedMimeTypes: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ],
  allowedExtensions: ['.pdf', '.jpg', '.jpeg', '.png', '.webp'],
  validateMagicBytes: true
};

// Constraints for Excel template uploads
export const TEMPLATE_UPLOAD_CONSTRAINTS: FileUploadConstraint = {
  maxSizeBytes: 10 * 1024 * 1024, // 10 MB
  allowedMimeTypes: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream'
  ],
  allowedExtensions: ['.xlsx', '.xls'],
  validateMagicBytes: true
};

// Dangerous executable and script extensions that must never be accepted
const BANNED_EXTENSIONS = new Set([
  '.exe', '.sh', '.bat', '.cmd', '.js', '.mjs', '.ts', '.php', '.phtml',
  '.py', '.rb', '.pl', '.html', '.htm', '.svg', '.vbs', '.dll', '.so',
  '.dylib', '.cgi', '.jar', '.war', '.jsp', '.asp', '.aspx', '.msi'
]);

export class UploadValidator {
  /**
   * Sanitizes a file name by removing directory traversal, null bytes, and non-printable characters.
   */
  public static sanitizeFilename(filename: string): string {
    if (!filename) return 'unnamed_file';

    // Normalize Windows backslashes to forward slashes first
    const normalized = filename.replace(/\\/g, '/');

    // Extract base filename (removes directory paths)
    let sanitized = path.basename(normalized);

    // Remove null bytes and control characters
    sanitized = sanitized.replace(/[\0\x00-\x1F\x7F]/g, '');

    // Strip relative traversal sequences
    sanitized = sanitized.replace(/\.\.+/g, '.');

    // Remove risky characters
    sanitized = sanitized.replace(/[^a-zA-Z0-9.\-_]/g, '_');

    // Limit length
    if (sanitized.length > 200) {
      const ext = path.extname(sanitized);
      sanitized = sanitized.slice(0, 190) + ext;
    }

    return sanitized || 'upload_' + Date.now();
  }

  /**
   * Verifies file header magic bytes against expected file types.
   */
  public static isMagicBytesValid(filePath: string, ext: string): boolean {
    if (!fs.existsSync(filePath)) return false;

    try {
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(16);
      fs.readSync(fd, buffer, 0, 16, 0);
      fs.closeSync(fd);

      const lowerExt = ext.toLowerCase();

      // PDF: Starts with %PDF (0x25 0x50 0x44 0x46)
      if (lowerExt === '.pdf') {
        return (
          buffer[0] === 0x25 &&
          buffer[1] === 0x50 &&
          buffer[2] === 0x44 &&
          buffer[3] === 0x46
        );
      }

      // JPEG: Starts with FF D8 FF
      if (lowerExt === '.jpg' || lowerExt === '.jpeg') {
        return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      }

      // PNG: Starts with 89 50 4E 47 0D 0A 1A 0A
      if (lowerExt === '.png') {
        return (
          buffer[0] === 0x89 &&
          buffer[1] === 0x50 &&
          buffer[2] === 0x4e &&
          buffer[3] === 0x47
        );
      }

      // WEBP: Starts with RIFF (0x52 0x49 0x46 0x46) and WEBP (0x57 0x45 0x42 0x50 at offset 8)
      if (lowerExt === '.webp') {
        return (
          buffer[0] === 0x52 &&
          buffer[1] === 0x49 &&
          buffer[2] === 0x46 &&
          buffer[3] === 0x46 &&
          buffer[8] === 0x57 &&
          buffer[9] === 0x45 &&
          buffer[10] === 0x42 &&
          buffer[11] === 0x50
        );
      }

      // XLSX (ZIP): Starts with PK 0x03 0x04 (0x50 0x4B 0x03 0x04)
      if (lowerExt === '.xlsx') {
        return (
          buffer[0] === 0x50 &&
          buffer[1] === 0x4b &&
          buffer[2] === 0x03 &&
          buffer[3] === 0x04
        );
      }

      // Default pass for other allowed extensions if not explicitly mapped
      return true;
    } catch (err) {
      console.warn('Error reading magic bytes:', err);
      return false;
    }
  }

  /**
   * Validates an uploaded Multer file against constraints.
   */
  public static validateFile(
    file: Express.Multer.File | undefined,
    constraints: FileUploadConstraint = BILL_UPLOAD_CONSTRAINTS
  ): UploadValidationResult {
    if (!file) {
      return {
        isValid: false,
        sanitizedFilename: '',
        mimeType: '',
        fileSizeBytes: 0,
        error: 'No file provided in upload request.'
      };
    }

    const sanitizedName = this.sanitizeFilename(file.originalname);
    const ext = path.extname(file.originalname).toLowerCase();
    const mimeType = file.mimetype;
    const size = file.size;

    // Check banned extensions
    if (BANNED_EXTENSIONS.has(ext)) {
      return {
        isValid: false,
        sanitizedFilename: sanitizedName,
        mimeType,
        fileSizeBytes: size,
        error: `Security Violation: Files with extension '${ext}' are strictly forbidden.`
      };
    }

    // Check allowed extensions
    if (!constraints.allowedExtensions.includes(ext)) {
      return {
        isValid: false,
        sanitizedFilename: sanitizedName,
        mimeType,
        fileSizeBytes: size,
        error: `Invalid file extension '${ext}'. Allowed extensions: ${constraints.allowedExtensions.join(', ')}.`
      };
    }

    // Check size limit
    if (size > constraints.maxSizeBytes) {
      const maxMb = Math.round(constraints.maxSizeBytes / (1024 * 1024));
      return {
        isValid: false,
        sanitizedFilename: sanitizedName,
        mimeType,
        fileSizeBytes: size,
        error: `File size (${(size / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed size of ${maxMb} MB.`
      };
    }

    // Check MIME type
    if (
      constraints.allowedMimeTypes.length > 0 &&
      !constraints.allowedMimeTypes.includes(mimeType) &&
      mimeType !== 'application/octet-stream' // Allow octet-stream if extension matches
    ) {
      return {
        isValid: false,
        sanitizedFilename: sanitizedName,
        mimeType,
        fileSizeBytes: size,
        error: `Unsupported MIME type '${mimeType}'. Expected: ${constraints.allowedMimeTypes.join(', ')}.`
      };
    }

    // Validate magic bytes if file exists on disk
    if (constraints.validateMagicBytes && file.path && fs.existsSync(file.path)) {
      const magicValid = this.isMagicBytesValid(file.path, ext);
      if (!magicValid) {
        return {
          isValid: false,
          sanitizedFilename: sanitizedName,
          mimeType,
          fileSizeBytes: size,
          error: `File signature mismatch: File content does not match expected format for extension '${ext}'.`
        };
      }
    }

    return {
      isValid: true,
      sanitizedFilename: sanitizedName,
      mimeType,
      fileSizeBytes: size
    };
  }
}
