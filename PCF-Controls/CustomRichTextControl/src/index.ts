import { Quill } from "react-quill";

export interface FontInfo {
  name: string;        // Display name e.g. "Roboto"
  quillValue: string;  // Used in <option value="">
  url: string;         // URL to font file or Google Fonts stylesheet
  cssFamily: string;   // Font-family value used in CSS, e.g. "Roboto"
}

function getFontMimeTypeFromUrl(url: string): string {
  const extension = url.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "ttf":
      return "font/ttf";
    case "otf":
      return "font/otf";
    case "woff":
      return "font/woff";
    case "woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

export async function getFontDataUri(fontUrl: string): Promise<string | null> {
  if (!fontUrl) return null;
  if (fontUrl.startsWith("http") && fontUrl.includes("fonts.googleapis.com")) return null;

  try {
    const response = await fetch(fontUrl);
    if (!response.ok) throw new Error(`Failed to fetch font file from ${fontUrl}: ${response.statusText}`);
    const fontBlob = await response.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result === "string") {
          resolve(result);
        } else {
          reject(new Error("FileReader did not return a string result."));
        }
      };
      reader.onerror = () => {
        reject(reader.error);
      };
      reader.readAsDataURL(fontBlob);
    });
  } catch (error) {
    console.error(`Error loading font from ${fontUrl}:`, error);
    return null;
  }
}

export function registerQuillFonts(fonts: FontInfo[]) {
  const FontAttributor = Quill.import("formats/font");
  FontAttributor.whitelist = fonts.map((f) => f.quillValue);
  Quill.register(FontAttributor, true);
}

export function injectFontStyles(fonts: FontInfo[], loadedFontDataUris: Record<string, string>) {
  const styleId = "quill-dynamic-font-style";
  let style = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = styleId;
    document.head.appendChild(style);
  }

  let allFontCss = "";

  fonts.forEach((font) => {
    if (font.url && font.url.startsWith("http") && font.url.includes("fonts.googleapis.com")) {
      const id = `font-link-${font.quillValue}`;
      if (!document.getElementById(id)) {
        const link = document.createElement("link");
        link.id = id;
        link.rel = "stylesheet";
        link.href = font.url;
        document.head.appendChild(link);
      }
    } else if (font.url && !font.url.startsWith("http")) {
      const dataUri = loadedFontDataUris[font.name];
      if (dataUri) {
        const format = getFontMimeTypeFromUrl(font.url).split("/")[1];
        const fontFormatInCss = format === "ttf" ? "truetype" : format;

        allFontCss += `
@font-face {
  font-family: '${font.cssFamily}';
  src: url('${dataUri}') format('${fontFormatInCss}');
  font-weight: normal;
  font-style: normal;
}
`;
      }
    }

    allFontCss += `
.ql-picker.ql-font .ql-picker-label[data-value="${font.quillValue}"]::before,
.ql-picker.ql-font .ql-picker-item[data-value="${font.quillValue}"]::before {
  content: "${font.name}";
  font-family: '${font.cssFamily}', sans-serif;
}

.ql-font-${font.quillValue} {
  font-family: '${font.cssFamily}', sans-serif;
}
`;
  });

  style.innerHTML = allFontCss;
}

export function cleanupFontStyles(fonts: FontInfo[]) {
  const dynamicStyle = document.getElementById("quill-dynamic-font-style");
  if (dynamicStyle) {
    document.head.removeChild(dynamicStyle);
  }
  fonts.forEach((font) => {
    if (font.url && font.url.startsWith("http") && font.url.includes("fonts.googleapis.com")) {
      const link = document.getElementById(`font-link-${font.quillValue}`);
      if (link) {
        document.head.removeChild(link);
      }
    }
  });
}

export async function applyFonts(fonts: FontInfo[]) {
  registerQuillFonts(fonts);

  const fontDataUris: Record<string, string> = {};
  await Promise.all(
    fonts.map(async (font) => {
      if (font.url && !font.url.startsWith("http")) {
        const dataUri = await getFontDataUri(font.url);
        if (dataUri) {
          fontDataUris[font.name] = dataUri;
        }
      }
    })
  );

  injectFontStyles(fonts, fontDataUris);
}

export async function loadFontsFromDataverse(): Promise<FontInfo[]> {
  console.warn(
    "loadFontsFromDataverse: This is a stub. Actual implementation will involve PCF context.webAPI to fetch font data from Dataverse or other PCF-specific resource loading."
  );
  return [];
}
