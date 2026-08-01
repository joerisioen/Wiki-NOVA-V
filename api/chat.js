import fs from "fs";
import path from "path";
import mammoth from "mammoth";

export default async function handler(req, res) {

  try {

    if (req.method !== "POST") {
      return res.status(405).json({
        antwoord: "Methode niet toegestaan."
      });
    }

    const { vraag } = req.body;

    const documentsPath = path.join(process.cwd(), "documents");

    const files = fs.readdirSync(documentsPath);

    let kennisbank = "";

    for (const file of files) {

      if (file.endsWith(".docx")) {

        const filePath = path.join(documentsPath, file);

        const result = await mammoth.extractRawText({
          path: filePath
        });

        kennisbank += `

BESTAND: ${file}

${result.value}

`;

      }

    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `
Je bent Aster.

Spreek in de ik-vorm.

Gebruik eerst de informatie uit onderstaande documenten.

Als het antwoord niet in de documenten staat, zeg dan eerlijk dat je het niet hebt gevonden.

DOCUMENTEN:

${kennisbank}

VRAAG:

${vraag}
`
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    const antwoord =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    return res.status(200).json({
      antwoord: antwoord || "Geen antwoord gevonden."
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      antwoord: error.message
    });

  }

}

