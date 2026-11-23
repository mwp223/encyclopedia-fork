
import path from "path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import XLSX from "xlsx";
import AdmZip from "adm-zip";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4mb"
    }
  }
};

async function extractFile(file) {
  const extension = path.extname(file.name).toLowerCase();
  const buffer = Buffer.from(file.data, "base64");

  switch (extension) {
    case ".pdf": {
      const result = await pdfParse(buffer);
      return result.text;
    }

    case ".docx": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    case ".xlsx":
    case ".xls": {
      const workbook = XLSX.read(buffer, { type: "buffer" });

      return workbook.SheetNames.map(name =>
        `SHEET: ${name}\n` +
        XLSX.utils.sheet_to_csv(workbook.Sheets[name])
      ).join("\n\n");
    }

    case ".pptx": {
      const zip = new AdmZip(buffer);

      return zip.getEntries()
        .filter(entry =>
          /^ppt\/slides\/slide\d+\.xml$/i.test(entry.entryName)
        )
        .sort((a, b) =>
          a.entryName.localeCompare(b.entryName, undefined, {
            numeric: true
          })
        )
        .map((entry, index) => {
          const xml = entry.getData().toString("utf8");

          const text = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
            .map(match => match[1])
            .join(" ");

          return `SLIDE ${index + 1}\n${text}`;
        })
        .join("\n\n");
    }

    case ".txt":
    case ".md":
    case ".csv":
    case ".json":
    case ".xml":
    case ".html":
    case ".css":
    case ".js":
    case ".py":
    case ".java":
    case ".sql":
      return buffer.toString("utf8");

    default:
      throw new Error(`Unsupported document format: ${extension}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const { files } = req.body || {};

    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No files provided."
      });
    }

    const results = [];

    for (const file of files) {
      try {
        if (
          !file ||
          typeof file.name !== "string" ||
          typeof file.data !== "string"
        ) {
          throw new Error("Invalid file data.");
        }

        const extractedText = await extractFile(file);

        results.push({
          name: path.basename(file.name),
          success: true,
          text: extractedText
        });
      } catch (error) {
        results.push({
          name: file?.name || "Unknown file",
          success: false,
          error: error.message
        });
      }
    }

    return res.status(200).json({
      success: true,
      files: results
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Document extraction failed."
    });
  }
}
