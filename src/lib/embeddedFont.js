import fontkit from '@pdf-lib/fontkit'
import regularUrl from '../assets/LiberationSans-Regular.ttf?url'
import boldUrl from '../assets/LiberationSans-Bold.ttf?url'

// Liberation Sans (SIL Open Font License 1.1, see THIRD-PARTY-LICENSES.txt) -
// metrically compatible with Helvetica/Arial, so swapping it in for
// StandardFonts.Helvetica/HelveticaBold doesn't reflow existing text layouts.
// pdf-lib's StandardFonts are never embedded (only *referenced* by name) -
// every feature that draws text into a PDF via a StandardFont therefore made
// that document fail the PDF/A font-embedding rule. This embeds a real,
// bundled, freely redistributable font instead.
export async function embedAppFont(doc, bold = false) {
  doc.registerFontkit(fontkit)
  const bytes = new Uint8Array(await (await fetch(bold ? boldUrl : regularUrl)).arrayBuffer())
  return doc.embedFont(bytes)
}
