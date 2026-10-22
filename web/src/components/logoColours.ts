/**
 * The colours public/hatch.svg is drawn in, written as the file writes them.
 * styles.css has a `.hatch-logo` rule for each, mapping it to a theme colour.
 * When the logo gains or changes a colour, update this list and those rules
 * together; logo.test.ts fails until the file and this list agree.
 */
export const LOGO_COLOURS = ["#fff", "#c4b5fd"] as const;
