
import formidable from "formidable";
import fs from "fs/promises";
import path from "path";

export const config = {
  api: {
    bodyParser: false
  }
};

const ALLOWED_METHOD = "POST";

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      multiples: true,
      maxFileSize: Infinity,
      maxTotalFileSize: Infinity,
      keepExtensions: true,
      allowEmptyFiles: false
    });

    form.parse(req, (error, fields, files) => {
      if (error) reject(error);
      else resolve({ fields, files });
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== ALLOWED_METHOD) {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  const temporaryPaths = [];

  try {
    const { files } = await parseForm(req);

    const uploaded = Object.values(files)
      .flat()
      .filter(Boolean);

    if (!uploaded.length) {
      return res.status(400).json({
        success: false,
        error: "No files were uploaded."
      });
    }

    const results = [];

    for (const file of uploaded) {
      const filePath = file.filepath;
      temporaryPaths.push(filePath);

      const originalName = path.basename(
        file.originalFilename || "unnamed-file"
      );

      const stats = await fs.stat(filePath);

      results.push({
        name: originalName,
        type: file.mimetype || "application/octet-stream",
        size: stats.size,
        status: "uploaded",
        message: "File received. Content extraction is not yet implemented."
      });
    }

    return res.status(200).json({
      success: true,
      files: results
    });

  } catch (error) {
    console.error("Upload error:", error);

    return res.status(500).json({
      success: false,
      error: "Upload failed. The hosting platform or request may have reached its limits."
    });

  } finally {
    await Promise.all(
      temporaryPaths.map(file =>
        fs.unlink(file).catch(() => {})
      )
    );
  }
}
