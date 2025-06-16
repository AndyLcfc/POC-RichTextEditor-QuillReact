// src/components/CustomRichTextControl.tsx

import React, { useEffect, useState, useMemo, useRef } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css"; // Ensure Quill's theme is imported
import { applyFonts, cleanupFontStyles, FontInfo } from "../fontHelper";
import { testFonts } from "../../test-harness/testFonts"; // Directly import test fonts
import { Quill } from 'react-quill'; // Import Quill as a value, not just a type

interface Props {
    value: string;
    onChange: (value: string) => void;
}

export function CustomRichTextControl({ value, onChange }: Props) {
    const [fontsLoaded, setFontsLoaded] = useState(false);
    const [fontError, setFontError] = useState<string | null>(null);
    const [activeFonts, setActiveFonts] = useState<FontInfo[]>([]); // To store fonts for cleanup
    const quillRef = useRef<ReactQuill>(null); // Ref to the ReactQuill component

    useEffect(() => {
        let isMounted = true; // Flag to track if component is mounted
        let quillInstance: any = null; // Store Quill instance to avoid repeated getEditor() calls

        async function loadAndInitializeEditor() {
            try {
                // 1. Load and apply fonts
                const fontsToLoad = testFonts;
                setActiveFonts(fontsToLoad);
                await applyFonts(fontsToLoad);

                if (!isMounted) return; // Exit if component unmounted during async operation
                setFontsLoaded(true);

                // 2. Get Quill instance and set up listeners/initial format
                // Use a short delay to ensure ReactQuill has fully mounted and assigned ref
                setTimeout(() => {
                    if (!isMounted || !quillRef.current) return;

                    quillInstance = quillRef.current.getEditor();
                    if (!quillInstance) return;

                    const defaultFont = fontsToLoad[0]; // Take the first font as default

                    // Helper function to ensure the default font is applied to the current context
                    const ensureDefaultFont = () => {
                        if (!isMounted || !quillInstance) return; // Re-check validity

                        const currentSelection = quillInstance.getSelection();

                        if (!currentSelection) {
                            // If no selection (e.g., editor just loaded, or lost focus), set cursor to start
                            // and apply format for new input.
                            quillInstance.setSelection(0, 0, 'silent');
                            quillInstance.format('font', defaultFont.quillValue, 'user');
                            return;
                        }

                        // Apply the default font to the current cursor position.
                        // This proactively sets the format for new characters.
                        // We use 'user' source to indicate it's from user action,
                        // preventing potential infinite loops if onChange triggers text-change.
                        quillInstance.format('font', defaultFont.quillValue, 'user');

                        // Optionally, if the user explicitly deleted all formatted text from a line
                        // and started typing again, we want to re-apply the font.
                        // This check is often not strictly needed with the proactive `format` above.
                        // const currentFormat = quillInstance.getFormat(currentSelection.index, currentSelection.length);
                        // if (!currentFormat.font || currentFormat.font !== defaultFont.quillValue) {
                        //     quillInstance.format('font', defaultFont.quillValue, 'user');
                        // }
                    };

                    // Add text-change listener for consistent formatting during user typing and new lines
                    const textChangeHandler = (delta: any, oldDelta: any, source: string) => {
                        if (source === 'user') {
                            // Use a 0ms setTimeout. This is CRUCIAL. It pushes the formatting
                            // logic to the next tick of the event loop, ensuring Quill's
                            // internal DOM updates and selection handling have fully settled.
                            setTimeout(ensureDefaultFont, 0);
                        }
                    };

                    quillInstance.on('text-change', textChangeHandler);

                    // Initial focus and application of default font when editor is ready
                    quillInstance.focus(); // Set focus to ensure an active selection/cursor
                    ensureDefaultFont(); // Apply default font right after initial load

                    // Store the handler reference for cleanup
                    quillInstance._textChangeHandler = textChangeHandler;

                }, 50); // Initial delay to ensure ReactQuill DOM is fully rendered

            } catch (error) {
                if (isMounted) {
                    console.error("Failed to load fonts for RichTextControl:", error);
                    setFontError("Failed to load fonts. Check console for details.");
                }
            }
        }

        loadAndInitializeEditor();

        // Cleanup function for useEffect
        return () => {
            isMounted = false; // Mark component as unmounted

            // Clean up Quill event listener
            if (quillInstance && quillInstance._textChangeHandler) {
                quillInstance.off('text-change', quillInstance._textChangeHandler);
                quillInstance._textChangeHandler = null; // Clear reference
            }
            console.log("Cleaning up dynamic font styles on unmount.");
            cleanupFontStyles(activeFonts);
        };
    }, []); // Empty dependency array: runs once on mount, cleans up on unmount

    // Memoize Quill modules for performance
    const modules = useMemo(() => {
        const initialFontValue = activeFonts.length > 0 ? activeFonts[0].quillValue : '';

        return {
            toolbar: {
                container: [
                    [{ font: activeFonts.map(f => f.quillValue), defaultValue: initialFontValue }],
                    ["bold", "italic", "underline", "strike"],
                    [{ color: [] }, { background: [] }],
                    [{ align: [] }],
                    [{ list: "ordered" }, { list: "bullet" }],
                    ["clean"]
                ]
            },
        };
    }, [activeFonts]);

    if (fontError) {
        return <div style={{ color: 'red' }}>Error loading editor: {fontError}</div>;
    }

    if (!fontsLoaded) {
        return <div>Loading fonts for editor...</div>;
    }

    return (
        <ReactQuill
            ref={quillRef}
            theme="snow"
            value={value}
            onChange={onChange}
            formats={[
                "font", "bold", "italic", "underline", "strike",
                "color", "background", "align", "list", "bullet"
            ]}
            modules={modules}
        />
    );
}
