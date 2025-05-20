const bytesToSize = (bytes: number) => {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

  if (bytes === 0) return "n/a";

  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)).toString(), 10);

  if (i === 0) return `${bytes} ${sizes[i]}`;

  return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
}

const getFileSizeFromURL = async (url: string) => {
  const req = await fetch(url, { method: 'HEAD' })

  return req.headers.get('content-length')
}

class JSONDecoderClass implements Transformer {
  constructor(private partialChunk: string = "") { }

  async transform(chunk: string, controller: { enqueue: (arg0: string) => void; }) {
    let buffer = this.partialChunk + chunk;
    let cursor = 0;

    // Handle the beginning of a JSON array if present
    // Trim leading whitespace and '['
    buffer = buffer.trimStart();
    if (buffer.startsWith('[')) {
      buffer = buffer.substring(1);
      // If the very first character of the stream was '[', 
      // and we only received that, wait for more data.
      if (buffer.length === 0) {
        this.partialChunk = ""; // consumed the '[' effectively
        return;
      }
    }
    
    // Trim leading whitespace that might appear after '[' or between objects
    buffer = buffer.trimStart();

    while (cursor < buffer.length) {
      if (buffer[cursor] !== '{') {
        // If we encounter data that isn't the start of an object,
        // and it's not just whitespace, it might be a malformed an array (e.g. missing comma, or unexpected chars)
        // or the end of the array. For now, we'll skip non-object-starting characters
        // if they are not whitespace. This behavior might need refinement.
        // If it's just whitespace, trimStart will handle it in the next iteration or next chunk.
        if (buffer[cursor].trim() !== '') {
            // console.warn(`Unexpected character at start of potential object: ${buffer[cursor]}`);
        }
        cursor++;
        continue;
      }

      let balance = 0;
      let inString = false;
      let objectStart = cursor;

      for (let i = cursor; i < buffer.length; i++) {
        const char = buffer[i];

        if (char === '"') {
          // Check for escaped quotes
          if (i > 0 && buffer[i - 1] !== '\\') {
            inString = !inString;
          } else if (i === 0) {
            inString = !inString;
          }
        }

        if (!inString) {
          if (char === '{') {
            balance++;
          } else if (char === '}') {
            balance--;
            if (balance === 0) {
              // Found a complete object
              const objString = buffer.substring(objectStart, i + 1);
              try {
                // Validate and re-serialize to ensure it's good JSON.
                // This also standardizes formatting slightly.
                const parsedObject = JSON.parse(objString);
                controller.enqueue(JSON.stringify(parsedObject) + ",");
                cursor = i + 1;
                objectStart = cursor; 
                
                // Trim leading characters before the next potential object (e.g. commas, whitespace)
                while (cursor < buffer.length && (buffer[cursor] === ',' || buffer[cursor].trim() === '')) {
                    cursor++;
                }
                objectStart = cursor;

              } catch (e) {
                // This wasn't a valid JSON object, could be part of a larger one.
                // Or it's genuinely malformed.
                // Continue scanning, the outer loop or next chunk might complete it.
                // console.error("Failed to parse potential JSON object:", objString, e);
              }
              break; // Restart search for next object from `cursor`
            }
          }
        }
        // If we are at the end of the buffer and balance is not 0, it's a partial object
        if (i === buffer.length - 1 && balance !== 0) {
          break; 
        }
      }

      if (balance !== 0 || objectStart === buffer.length) {
        // If balance is not zero, we have a partial object.
        // Or if objectStart is at the end, means we scanned but found nothing complete.
        this.partialChunk = buffer.substring(objectStart);
        return;
      } else if (balance === 0 && cursor < buffer.length) {
        // We successfully processed an object, and there might be more data in the buffer.
        // The loop will continue from the updated cursor.
        // If cursor reached end of buffer, partialChunk should be empty.
        if(cursor === buffer.length) {
            this.partialChunk = "";
        } else {
            // This case should ideally be handled by the next iteration of the while loop
            // or if the remaining part is not an object, it will become partialChunk.
            // For safety, we can assign remaining to partialChunk if no new object is found.
             const remaining = buffer.substring(cursor).trimStart();
             if (remaining && !remaining.startsWith("{")) {
                // console.warn("Remaining data does not start with '{':", remaining);
                // Potentially part of an array like `]`. We might need to buffer this.
                this.partialChunk = remaining;
                return;
             } else {
                 this.partialChunk = remaining; // It might be a new object starting
             }
        }
      } else {
        // Default: whatever is left is partial
        this.partialChunk = buffer.substring(cursor);
        return;
      }
    }
    // If the loop finishes and cursor is at the end, all processed.
    if (cursor >= buffer.length) {
        this.partialChunk = "";
    }
  }

  flush(controller: { enqueue: (arg0: string) => void; terminate: () => void; error: (error: Error) => void; }) {
    this.partialChunk = this.partialChunk.trim();
    if (this.partialChunk.startsWith(',')) {
        this.partialChunk = this.partialChunk.substring(1).trim();
    }
    // After trimming, if partialChunk is just ']' or empty, it's fine.
    // Otherwise, it might be an incomplete JSON object.
    if (this.partialChunk.length > 0 && this.partialChunk !== ']') {
      // console.warn(`Stream ended with incomplete JSON data in buffer: ${this.partialChunk}`);
      // Depending on strictness, one might choose to error here:
      // controller.error(new Error(`Stream ended with incomplete JSON data: ${this.partialChunk}`));
    }
    this.partialChunk = ""; // Clear the buffer
  }
}

class CSVDecoderClass implements Transformer<string, string[]> {
  private partialChunk: string = "";
  private currentRow: string[] = [];
  private currentField: string = "";
  private inQuotedField: boolean = false;

  constructor() {
    // State is initialized in declarations
  }

  transform(chunk: string, controller: TransformStreamDefaultController<string[]>) {
    let data = this.partialChunk + chunk;
    this.partialChunk = ""; // Consume the old partialChunk immediately
    let cursor = 0;

    while (cursor < data.length) {
      const char = data[cursor];
      let remainingDataLength = data.length - (cursor + 1) ;

      if (this.inQuotedField) {
        if (char === '"') {
          if (remainingDataLength > 0 && data[cursor + 1] === '"') {
            // Escaped quote: ""
            this.currentField += '"';
            cursor++; // Consume the second quote of the pair
          } else {
            // End of quoted field
            this.inQuotedField = false;
          }
        } else {
          // Character inside a quoted field (includes newlines, \r, etc.)
          this.currentField += char;
        }
      } else { // Not in a quoted field
        if (char === '"') {
          // Start of a new quoted field only if currentField is empty.
          // RFC 4180: quotes are only special as the first char of a field.
          if (this.currentField === "") {
            this.inQuotedField = true;
          } else {
            // Quote is part of an unquoted field's data (technically malformed by strict RFC 4180)
            this.currentField += char; 
          }
        } else if (char === ',') {
          this.currentRow.push(this.currentField);
          this.currentField = "";
        } else if (char === '\n' || char === '\r') {
          this.currentRow.push(this.currentField);
          this.currentField = "";
          
          if (char === '\r' && remainingDataLength > 0 && data[cursor + 1] === '\n') {
            cursor++; 
          }
          // A row is now complete, enqueue it.
          // This includes rows that might be all empty strings (e.g. from ",\n" or just "\n")
          controller.enqueue([...this.currentRow]); // Enqueue a copy
          this.currentRow = []; // Reset for the next row
        } else {
          // Regular character in an unquoted field
          this.currentField += char;
        }
      }
      cursor++;
    }

    // If the loop finishes, it means all data in the current chunk has been processed.
    // Any incomplete field/row data is stored in this.currentField, this.currentRow, and this.inQuotedField.
    // No need to set this.partialChunk to data.substring(cursor) because that would be empty.
    // The state variables themselves ARE the "partial chunk" of parsing.
  }

  flush(controller: TransformStreamDefaultController<string[]>) {
    // Called when the stream is about to close.
    // Process any remaining data in currentField or currentRow.

    if (this.inQuotedField) {
      // Unterminated quoted field. As per RFC 4180, this is a parse error.
      // However, many parsers will try to recover by treating the content as is.
      // console.warn("CSV stream ended with an unterminated quoted field:", this.currentField);
      // The currentField will be added to currentRow as is.
    }
    
    // Add the final field to the currentRow.
    // This handles cases like "a,b" (EOF after b) or "a,b," (EOF after comma).
    this.currentRow.push(this.currentField);
    this.currentField = ""; // Clear currentField as it's now part of currentRow or was empty
    
    // Enqueue the last row if it has any fields.
    // This covers:
    // - A file ending without a newline (e.g., "a,b" -> currentRow is ["a","b"])
    // - A file ending with a newline but no new data (e.g., "a,b\n" -> transform handled it, currentRow is empty here)
    // - A file ending with a trailing comma (e.g., "a," -> currentRow is ["a",""])
    // - A file that was just "a" -> currentRow is ["a"]
    // - An empty file -> currentRow is [""] because currentField ("") was pushed. This is debatable.
    //   If the file is truly empty (0 bytes), transform/flush won't run.
    //   If the file is "\n", transform sends [""].
    //   If the file is "", currentField="", currentRow=[]. push("") -> [""] -> enqueue([""])
    //   To avoid enqueueing [""] for an empty stream that wasn't explicitly a line:
    if (this.currentRow.length > 1 || (this.currentRow.length === 1 && this.currentRow[0] !== "")) {
        controller.enqueue([...this.currentRow]);
    } else if (this.currentRow.length === 1 && this.currentRow[0] === "" ) {
        // This means the stream ended, and the only thing left was an empty currentField.
        // This could be from an empty input, or from a line like ",\n" where the last field was empty.
        // Only enqueue if there was actual data that resulted in this empty field,
        // e.g. a comma before EOF.
        // If partialChunk was used to store actual unprocessed chars, we could check its length.
        // For now, if this.partialChunk was consumed and data resulted in this state, it's likely intentional.
        // Let's assume if currentRow has anything, it's intentional from parsing.
        // Example: "" -> results in currentField="", pushed to currentRow=[""], enqueued.
        // Example: "," -> currentField="" pushed, currentRow=[""], currentField="" pushed, currentRow=["",""], enqueued.
        // This seems correct by CSV logic (empty fields are fields).
        controller.enqueue([...this.currentRow]);
    }
    
    // Reset state for potential reuse (though flush is typically final)
    this.currentRow = [];
    this.currentField = "";
    this.inQuotedField = false;
    this.partialChunk = ""; // Ensure partialChunk is cleared
  }
}

export { bytesToSize, getFileSizeFromURL, JSONDecoderClass, CSVDecoderClass }
