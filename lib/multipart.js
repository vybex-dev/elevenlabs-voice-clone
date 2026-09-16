import busboy from "busboy";

export function parseMultipartForm(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    const files = [];

    let bb;
    try {
      bb = busboy({ headers: req.headers });
    } catch (err) {
      return reject(new Error("Failed to initialize multipart parser: " + err.message));
    }

    bb.on("field", (name, val) => {
      fields[name] = val;
    });

    bb.on("file", (name, fileStream, info) => {
      const { filename, encoding, mimeType } = info;
      const chunks = [];

      fileStream.on("data", (data) => {
        chunks.push(data);
      });

      fileStream.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const blob = new Blob([buffer], { type: mimeType || "application/octet-stream" });
        files.push({
          fieldName: name,
          filename: filename || "upload.bin",
          mimeType,
          encoding,
          size: buffer.length,
          buffer,
          blob,
        });
      });
    });

    bb.on("finish", () => {
      resolve({ fields, files });
    });

    bb.on("error", (err) => {
      reject(err);
    });

    req.pipe(bb);
  });
}
