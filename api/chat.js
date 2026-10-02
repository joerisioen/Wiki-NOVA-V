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
        )
        .slice(0, 6)
        .map(
          (resultaat) =>
            resultaat.chunk
        )
        .join("\n\n");

    const prompt = `
Je bent NOVA Chat.

Gebruik uitsluitend de meegegeven documentfragmenten.

Wanneer het antwoord niet voldoende terug te vinden is in de documentfragmenten, zeg dan eerlijk dat je het antwoord niet hebt gevonden.

Geef uitsluitend HTML terug.

Gebruik:

<h1> Hoofdonderwerp
<h2> Onderdeel
<h3> Verdere onderverdeling
<p> Tekst
<ul><li> Opsommingen
<ol><li> Stappenplannen

Regels:

- Gebruik een duidelijke structuur.
- Gebruik h1 voor de hoofdtitel.
- Gebruik h2 en h3 waar nuttig.
- Geef procedures als genummerde stappen.
- Gebruik korte alinea's.
- Gebruik geen markdown.
- Gebruik alleen informatie uit de documenten.
- Vermijd herhalingen.

DOCUMENTFRAGMENTEN:

${relevanteChunks}

VRAAG:

${vraag}
`;

    const response =
      await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],

            generationConfig: {
              temperature: 0.2,
              topP: 0.8,
              topK: 20,
              maxOutputTokens: 2048,
            },
          }),
        }
      );

    const data =
      await response.json();

    console.log(
      "Gemini:",
      JSON.stringify(data)
    );

    const antwoord =
      data?.candidates?.[0]
        ?.content?.parts?.[0]
        ?.text ||
      "<p>Geen antwoord gevonden.</p>";

    return res
      .status(200)
      .json({
        antwoord,
      });

  } catch (error) {

    console.error(error);

    return res
      .status(500)
      .json({
        antwoord:
          error.message ||
          "Interne serverfout"
      });
  }
}
