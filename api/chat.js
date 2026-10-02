import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import pdf from "pdf-parse";

let cachedKnowledge = null;

async function laadKennisbank() {
  if (cachedKnowledge) {
    return cachedKnowledge;
  }

  const documentsPath = path.join(
    process.cwd(),
    "documents"
  );

  const files = fs.readdirSync(documentsPath);

  let kennisbank = "";

  for (const file of files) {

    try {

      if (file.endsWith(".docx")) {

        const filePath = path.join(
          documentsPath,
          file
        );

        const result =
          await mammoth.extractRawText({
            path: filePath
          });

        kennisbank += `

BESTAND: ${file}

${result.value}

`;

      }

      else if (file.endsWith(".pdf")) {

        const filePath = path.join(
          documentsPath,
          file
        );

        const buffer =
          fs.readFileSync(filePath);

        const result =
          await pdf(buffer);

        kennisbank += `

BESTAND: ${file}

${result.text || ""}

`;

      }

    } catch (error) {

      console.error(
        `Fout bij verwerken van ${file}:`,
        error
      );

    }
  }

  cachedKnowledge = kennisbank;

  console.log(
    "✅ Kennisbank geladen en gecachet"
  );

  return kennisbank;
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

    const kennisbank =
      await laadKennisbank();

    const prompt = `
Je bent NOVA Chat, de digitale assistent van NOVA.

Gebruik uitsluitend informatie uit de documenten.

Wanneer het antwoord niet in de documenten voorkomt, zeg dat eerlijk.

Geef altijd geldig HTML.

Gebruik:
<h1>
<h2>
<h3>
<p>
<ul><li>
<ol><li>

Gebruik nooit markdown.

Maak antwoorden overzichtelijk en goed leesbaar.

DOCUMENTEN:

${kennisbank}

VRAAG:

${vraag}
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],

          generationConfig: {
            temperature: 0.2,
            topP: 0.8,
            topK: 20,
            maxOutputTokens: 2048
          }
        })
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

    return res.status(200).json({
      antwoord
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      antwoord:
        error.message ||
        "Interne serverfout"
    });

  }

}
