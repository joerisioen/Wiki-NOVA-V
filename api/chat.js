import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import pdf from "pdf-parse";

let cachedChunks = null;

/**
 * Tekst opdelen in overlappende chunks
 */
function chunkText(text, size = 3000, overlap = 800) {
  const chunks = [];

  let start = 0;

  while (start < text.length) {
    chunks.push(
      text.slice(start, start + size)
    );

    start += size - overlap;
  }

  return chunks;
}

/**
 * Relevantie bepalen op basis van:
 * - exacte vraag
 * - zinsdelen
 * - woorden
 * - woorden dicht bij elkaar
 * - bestandsnaam
 */
function scoreChunk(chunk, vraag) {
  const text = chunk.toLowerCase();
  const query = vraag.toLowerCase();

  let score = 0;

  // Exacte vraag
  if (text.includes(query)) {
    score += 500;
  }

  // Volledige zinsdelen
  const phrases = query
    .split(/[,.!?]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 5);

  phrases.forEach((phrase) => {
    if (text.includes(phrase)) {
      score += 200;
    }
  });

  // Woorden
  const woorden = query
    .split(/\s+/)
    .filter((w) => w.length > 2);

  woorden.forEach((woord) => {
    const escaped =
      woord.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

    const matches =
      text.match(
        new RegExp(escaped, "g")
      );

    if (matches) {
      score += matches.length * 10;
    }
  });

  // Woorden dicht bij elkaar
  const positions = woorden
    .map((woord) =>
      text.indexOf(woord)
    )
    .filter((p) => p >= 0);

  if (positions.length >= 2) {
    const afstand =
      Math.max(...positions) -
      Math.min(...positions);

    if (afstand < 400) score += 100;
    if (afstand < 200) score += 100;
    if (afstand < 100) score += 100;
  }

  // Bestandsnaam belangrijk maken
  const fileMatch =
    text.match(/bestand:\s*(.*)/i);

  if (fileMatch) {
    const fileName =
      fileMatch[1].toLowerCase();

    woorden.forEach((woord) => {
      if (fileName.includes(woord)) {
        score += 100;
      }
    });
  }

  return score;
}

/**
 * Documenten laden en cachen
 */
async function laadDocumenten() {
  if (cachedChunks) {
    return cachedChunks;
  }

  const documentsPath =
    path.join(
      process.cwd(),
      "documents"
    );

  const files =
    fs.readdirSync(documentsPath);

  let kennisbank = "";

  for (const file of files) {
    const filePath =
      path.join(
        documentsPath,
        file
      );

    try {
      if (file.endsWith(".docx")) {
        const result =
          await mammoth.extractRawText({
            path: filePath,
          });

        kennisbank += `
BESTAND: ${file}

${result.value}

`;
      }

      else if (
        file.endsWith(".pdf")
      ) {
        const buffer =
          fs.readFileSync(
            filePath
          );

        const result =
          await pdf(buffer);

        kennisbank += `
BESTAND: ${file}

${result.text}

`;
      }
    }

    catch (err) {
      console.error(
        `Fout in ${file}:`,
        err
      );
    }
  }

  cachedChunks = chunkText(
    kennisbank,
    3000,
    800
  );

  console.log(
    `✅ ${cachedChunks.length} chunks geladen`
  );

  return cachedChunks;
}

export default async function handler(
  req,
  res
) {
  try {

    if (req.method !== "POST") {
      return res.status(405).json({
        antwoord:
          "Methode niet toegestaan."
      });
    }

    const { vraag } = req.body;

    if (!vraag) {
      return res.status(400).json({
        antwoord:
          "Geen vraag ontvangen."
      });
    }

    const chunks =
      await laadDocumenten();

    const relevanteChunks =
      chunks
        .map((chunk) => ({
          chunk,
          score:
            scoreChunk(
              chunk,
              vraag
            ),
        }))
        .sort(
          (a, b) =>
            b.score - a.score
