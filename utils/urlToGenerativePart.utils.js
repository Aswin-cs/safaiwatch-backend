import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

/**
 * Downloads a remote image URL, data URL, local file path, or Buffer and converts it for Gemini inlineData
 * @param {string|Buffer} input 
 * @param {string} [fallbackMimeType='image/jpeg']
 * @returns {Promise<{ inlineData: { data: string, mimeType: string } }>}
 */
export const urlToGenerativePart = async (input, fallbackMimeType = 'image/jpeg') => {
      if (!input) {
            throw new Error("urlToGenerativePart requires a valid URL, file path, data URL, or Buffer.");
      }

      // 1. Handle Buffer input
      if (Buffer.isBuffer(input)) {
            return {
                  inlineData: {
                        data: input.toString("base64"),
                        mimeType: fallbackMimeType
                  }
            };
      }

      if (typeof input !== 'string') {
            throw new Error(`Invalid input type passed to urlToGenerativePart: ${typeof input}`);
      }

      // 2. Handle Data URL (e.g. data:image/png;base64,...)
      if (input.startsWith("data:")) {
            const matches = input.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
                  return {
                        inlineData: {
                              data: matches[2],
                              mimeType: matches[1] || fallbackMimeType
                        }
                  };
            }
      }

      // 3. Handle HTTP / HTTPS URL
      if (input.startsWith("http://") || input.startsWith("https://")) {
            const response = await fetch(input);
            if (!response.ok) {
                  throw new Error(`Failed to fetch image from URL: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const mimeType = response.headers.get('content-type') || fallbackMimeType;
            return {
                  inlineData: {
                        data: buffer.toString("base64"),
                        mimeType: mimeType
                  }
            };
      }

      // 4. Handle Local File Path
      if (fs.existsSync(input)) {
            const fileBuffer = await fs.promises.readFile(input);
            const ext = path.extname(input).toLowerCase();
            let mimeType = fallbackMimeType;
            if (ext === '.png') mimeType = 'image/png';
            else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
            else if (ext === '.webp') mimeType = 'image/webp';

            return {
                  inlineData: {
                        data: fileBuffer.toString("base64"),
                        mimeType: mimeType
                  }
            };
      }

      // Fallback attempt: fetch input string directly
      const response = await fetch(input);
      if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mimeType = response.headers.get('content-type') || fallbackMimeType;

      return {
            inlineData: {
                  data: buffer.toString("base64"),
                  mimeType: mimeType
            }
      };
};