import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import pdf from "pdf-parse";
 
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
      else if (file.endsWith(".pdf")) {

  const filePath = path.join(documentsPath, file);

  const buffer = fs.readFileSync(filePath);

  const result = await pdf(buffer);

  kennisbank += `
BESTAND: ${file}

${result.text}
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
Je bent NOVA Chat, de digitale assistent van NOVA.
Beantwoord vragen uitsluitend op basis van de beschikbare documenten.
Als de informatie niet aanwezig is in de documenten, zeg dan eerlijk dat je het antwoord niet hebt gevonden.

Belangrijk:
Geef je antwoord steeds in nette HTML-opmaak.

Gebruik:
<h2> voor hoofdonderdelen
<h3> voor subonderdelen
<ul><li> voor opsommingen
<ol><li> voor stappenplannen
<p> voor gewone tekst

Gebruik NOOIT markdown zoals:
#, ##, ###, *, **, -, ---, of tabellen.

Het antwoord moet onmiddellijk leesbaar zijn voor medewerkers, leerlingen en ouders.

Kies zelf de meest geschikte structuur:
- gebruik titels wanneer er verschillende onderdelen zijn;
- gebruik opsommingen wanneer er meerdere items zijn;
- gebruik stappenplannen voor procedures;
- gebruik korte alinea's voor uitleg.

Vermijd grote tekstblokken.

Antwoord uitsluitend met de inhoud van het antwoord. Geef geen uitleg over de opmaak.

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
console.log(JSON.stringify(data, null, 2));
// Quota bereikt
if (data.error?.code === 429) {
return res.status(200).json({
antwoord:
"NOVA Chat is momenteel tijdelijk niet beschikbaar omdat het AI-limiet bereikt werd. Probeer later opnieuw."
});
}
// Andere Gemini-fouten
if (data.error) {
return res.status(200).json({
antwoord: `Technische fout: ${data.error.message}`
});
}
const antwoord =
data?.candidates?.[0]?.content?.parts?.[0]?.text;
return res.status(200).json({
antwoord: antwoord || "Geen antwoord ontvangen van Gemini."
});
    });

  }

}
