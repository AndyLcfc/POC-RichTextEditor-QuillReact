// src/fontHelper.ts

import { Quill } from 'react-quill'; // Keep this import for Quill's main API

export interface FontInfo {
    name: string;        // Display name in dropdown (e.g., "Virgin Money Loop Light")
    quillValue: string;  // Value used internally by Quill (NO SPACES, e.g., 'Virgin-Money-Loop-Light')
    url: string;         // URL for Google Fonts CSS, local font file path, or empty for system fonts
    cssFamily: string;   // CSS font-family value (e.g., 'Virgin Money Loop, sans-serif')
}

// --- Corrected Type Definition for Quill's Font Attributor Constructor ---
// This interface defines the expected shape of the object returned by Quill.import('formats/font').
// It's typically the constructor (class) of the Font Attributor, which has static properties
// required for Quill.register to recognize it as a BlotConstructor/RegistryDefinition.
// We define only the static properties we directly set or interact with,
// and acknowledge it's a constructor by including 'new'.
interface QuillFontAttributorConstructor {
    // This part defines the constructor signature.
    // It indicates that this type can be 'newed up' to create an instance.
    new(...args: any[]): any; // Using 'any' here for the instance type to simplify and avoid deep Blot typing issues.

    // --- Static properties required by BlotConstructor (and inherited by Attributor) ---
    blotName: string; // The name of the blot, e.g., 'font' for FontAttributor
    tagName: string | string[]; // The HTML tag(s) associated, e.g., 'SPAN' for font format
    create(value: any): HTMLElement; // Method to create the DOM node for the blot.
    // --- End of BlotConstructor properties ---

    // Static properties specific to Attributor (inherited from Attributor base class)
    key: string; // e.g., 'font' (often matches blotName)
    attribute: string; // The CSS property it manages, e.g., 'font-family'
    scope: any; // e.g., Quill.Scope.INLINE. Using 'any' for simplicity; it's usually Scope.INLINE from Quill.
    whitelist: string[]; // This is the array of allowed font values (quillValue)
    // ... other static properties from Attributor base class if necessary
}

// --- Helper Function for MIME Type ---

function getFontMimeTypeFromUrl(url: string): string {
    const extension = url.split('.').pop()?.toLowerCase();
    switch (extension) {
        case 'ttf': return 'font/ttf';
        case 'otf': return 'font/otf';
        case 'woff': return 'font/woff';
        case 'woff2': return 'font/woff2';
        case 'eot': return 'application/vnd.ms-fontobject'; // For older IE support
        default: return 'application/octet-stream'; // Fallback
    }
}

/**
 * Fetches a font file and converts it to a Base64 Data URI using FileReader.
 * This function should ONLY be called for local font paths (not http/https URLs).
 * Returns null if fetching fails or if it's an external URL/empty URL.
 */
export async function getFontDataUri(fontUrl: string): Promise<string | null> {
    // Skip if it's an external URL (http/https) or an empty URL (system font)
    if (fontUrl.startsWith('http') || !fontUrl) {
        return null;
    }

    try {
        const response = await fetch(fontUrl);

        if (!response.ok) {
            throw new Error(`Failed to fetch font file from ${fontUrl}: ${response.statusText}`);
        }

        const fontBlob = await response.blob(); // Get as Blob

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result; // This will be the Data URL
                if (typeof result === 'string') {
                    resolve(result);
                } else {
                    reject(new Error('FileReader did not return a string result.'));
                }
            };
            reader.onerror = () => {
                console.error('FileReader error:', reader.error);
                reject(reader.error);
            };
            reader.readAsDataURL(fontBlob); // Read the Blob as a Data URL
        });

    } catch (error) {
        console.error(`Error loading font from ${fontUrl}:`, error);
        return null;
    }
}

// --- Main Font Setup Functions for Quill ---

/**
 * Registers the given fonts with Quill's FontAttributor.
 * This tells Quill which font names it should recognize and apply to content.
 * Should be called once when fonts are known.
 */
export function registerQuillFonts(fonts: FontInfo[]) {
    // We assert that the imported module is the constructor function with a whitelist.
    // By including blotName, tagName, and create, it now conforms to BlotConstructor.
    const FontAttributor = Quill.import('formats/font') as QuillFontAttributorConstructor;

    // Set the whitelist for the Font Attributor directly on the constructor (class).
    FontAttributor.whitelist = fonts.map((f) => f.quillValue);

    // Register the Attributor class (constructor) with Quill.
    // We cast to `any` here to bypass the complex and sometimes unresolvable type
    // checking by TypeScript for Quill's `register` overloads, especially
    // when direct internal Blot/Attributor types are not easily importable.
    Quill.register(FontAttributor as any, true);
}

/**
 * Injects CSS rules for fonts into the document head.
 * This includes:
 * - <link> tags for external CSS font services.
 * - @font-face rules for local fonts (using Data URIs).
 * - @font-face rules for direct external font file URLs.
 * - Quill-specific styles for dropdown labels and editor content.
 *
 * @param fonts The array of font definitions.
 * @param loadedFontDataUris A map of font names (using font.name) to their Base64 Data URIs.
 */
export function injectFontStyles(fonts: FontInfo[], loadedFontDataUris: Record<string, string>) {
    const styleId = 'quill-dynamic-font-style';
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        document.head.appendChild(style);
    }

    let allFontCss = '';

    fonts.forEach(font => {
        // Determine if it's an external URL pointing to a CSS file (like Google Fonts CSS)
        const isExternalCssLink = font.url.startsWith('http') && (font.url.toLowerCase().endsWith('.css') || font.url.includes('family='));
        // Determine if it's an external URL pointing directly to a font file
        const isExternalFontFile = font.url.startsWith('http') && !isExternalCssLink && getFontMimeTypeFromUrl(font.url) !== 'application/octet-stream';
        // Determine if it's a local font file (for Data URI)
        const isLocalFontFile = font.url && !font.url.startsWith('http');


        if (isExternalCssLink) {
            // Add as <link rel="stylesheet">
            const id = `font-link-${font.quillValue}`; // Use quillValue for id for consistency
            if (!document.getElementById(id)) { // Prevent adding duplicate links
                const link = document.createElement('link');
                link.id = id;
                link.rel = 'stylesheet';
                link.href = font.url;
                document.head.appendChild(link);
            }
        }
        else if (isExternalFontFile) {
            // Add as @font-face using the direct URL
            const format = getFontMimeTypeFromUrl(font.url).split('/')[1]; // e.g., 'ttf' from 'font/ttf'
            const fontFormatInCss = format === 'ttf' ? 'truetype' : format; // Convert 'ttf' to 'truetype'

            allFontCss += `
@font-face {
  font-family: '${font.name}';
  src: url('${font.url}') format('${fontFormatInCss}');
  font-weight: normal; /* Customize if your font has specific weights */
  font-style: normal;  /* Customize if your font has specific styles */
  font-display: swap; /* Add this for better font loading behavior */
}
`;
        }
        else if (isLocalFontFile) {
            // Add as @font-face using a Data URI (already fetched)
            const dataUri = loadedFontDataUris[font.name]; // Use font.name to retrieve from loadedFontDataUris
            if (dataUri) { // Only inject @font-face if data URI is available
                const format = getFontMimeTypeFromUrl(font.url).split('/')[1]; // e.g., 'ttf' from 'font/ttf'
                const fontFormatInCss = format === 'ttf' ? 'truetype' : format; // Convert 'ttf' to 'truetype'

                allFontCss += `
@font-face {
  font-family: '${font.name}';
  src: url('${dataUri}') format('${fontFormatInCss}');
  font-weight: normal; /* Customize if your font has specific weights */
  font-style: normal;  /* Customize if your font has specific styles */
  font-display: swap; /* Add this for better font loading behavior */
}
`;
            } else {
                console.warn(`Font data URI not found for ${font.name}. Skipping @font-face injection.`);
            }
        }
        // System fonts (font.url is empty) don't need @font-face or <link> tag
        // If font.url is empty, none of the above conditions will be true,
        // but its .ql-font-* class will still be generated below.

        // 4. Always add Quill-specific styles for dropdown labels and editor content, regardless of font source
        allFontCss += `
/* Styles for font picker dropdown label */
.ql-picker.ql-font .ql-picker-label[data-value="${font.quillValue}"]::before,
.ql-picker.ql-font .ql-picker-item[data-value="${font.quillValue}"]::before {
  content: "${font.name}"; /* Displays the user-friendly name in the dropdown */
  font-family: ${font.cssFamily}; /* Applies the cssFamily (e.g., 'Virgin Money Loop, sans-serif') */
}
/* Styles for actual content in the editor */
.ql-font-${font.quillValue} {
  font-family: ${font.cssFamily}; /* Applies the cssFamily (e.g., 'Virgin Money Loop, sans-serif') */
}
`;
    });

    style.innerHTML = allFontCss; // Set all rules in one go
}

/**
 * Cleans up dynamically injected font <link> and <style> tags.
 * This should be called on component unmount to prevent memory leaks in SPAs.
 */
export function cleanupFontStyles(fonts: FontInfo[]) {
    // Remove the main dynamic style tag
    const dynamicStyle = document.getElementById('quill-dynamic-font-style');
    if (dynamicStyle) {
        dynamicStyle.remove(); // Use .remove() for modern browsers
    }
    // Remove link tags for external stylesheets (e.g., Google Fonts)
    fonts.forEach(font => {
        const id = `font-link-${font.quillValue}`; // Reconstruct ID used during injection
        const link = document.getElementById(id);
        if (link) {
            link.remove();
        }
    });
}

/**
 * Placeholder for fetching fonts from Dataverse (or other dynamic source).
 * Replace with your actual implementation.
 */
export async function loadFontsFromDataverse(): Promise<FontInfo[]> {
    console.warn("loadFontsFromDataverse: This is a stub. Actual implementation will involve PCF context.webAPI to fetch font data from Dataverse or other PCF-specific resource loading.");
    // Example of a mocked response for production:
    return [
        { name: 'Arial', quillValue: 'arial', url: '', cssFamily: 'Arial, sans-serif' },
        { name: 'Times New Roman', quillValue: 'times-new-roman', url: '', cssFamily: '"Times New Roman", serif' },
    ];
}

/**
 * Orchestrates the font loading, Quill registration, and CSS injection.
 * This is the main function to call in your component's useEffect.
 */
export async function applyFonts(fonts: FontInfo[]) {
    // Step 1: Load local fonts into data URIs (only for local paths)
    const loadedFontDataUris: Record<string, string> = {};
    await Promise.all(
        fonts.map(async font => {
            if (font.url && !font.url.startsWith('http')) { // Only process local/custom URLs (not http/https)
                const dataUri = await getFontDataUri(font.url);
                if (dataUri) {
                    loadedFontDataUris[font.name] = dataUri;
                }
            }
        })
    );

    // Step 2: Register with Quill's internal API
    registerQuillFonts(fonts);

    // Step 3: Inject dynamic CSS rules into the document head
    injectFontStyles(fonts, loadedFontDataUris);
}
