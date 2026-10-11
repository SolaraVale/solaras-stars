# Solara's Stars

See your Obsidian vault as a slowly turning 3D cluster of stars.

Every note is a star. Every link is a faint thread of light. Notes with many links shine brighter, and the whole sky settles into clusters as you watch.

![A vault as a turning cluster of stars](screenshot.png)

## What it does

- **A 3D star map of your vault** that turns slowly on its own
- **Drag** to turn it, **scroll** to zoom, **hover** a star to see its name and light up its threads, **click** to open the note
- **Your colors:** stars use the color groups you've already set in Obsidian's graph view (or one color per top-level folder)
- **Your filter:** notes your graph view filters out (like `-path:archive`) stay out of the sky too
- **Hide names** for screenshots: one button, or press **H**
- Links to notes that don't exist yet appear as faint white stars
- Works offline. It only reads your vault's notes and links, and sends nothing anywhere.

## Install

Until it's in Obsidian's community plugin list:

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](../../releases/latest).
2. In your vault, open the hidden `.obsidian/plugins` folder and make a new folder inside it named `solaras-stars`.
3. Put the three files in that folder.
4. In Obsidian, go to **Settings → Community plugins**, turn on community plugins if asked, and switch on **Solara's Stars**.
5. Click the ✨ icon in the left ribbon (or run **Solara's Stars: Open star map** from the command palette).

## Settings

| Setting | What it does |
|---|---|
| Star colors | Graph view color groups, or one color per top-level folder |
| Use the graph view's filter | Leave out what your graph view filters out |
| Leave out folders | Comma-separated folders to skip, like `archive, templates` |
| Links to notes that don't exist yet | Show them as faint stars, or not |
| Turning speed | 0 stops the slow turn |
| Names shown | How many of the brightest stars show their names |
| Hide all names | Just the stars (also the **H** key) |

Color groups and filters understand `path:`, `file:`, `tag:`, plain words, `"quoted text"`, `-` to leave something out, and `OR`. Content searches aren't supported.

Big vaults are fine: past a couple thousand notes the layout uses an approximation so it stays smooth.

## Where it comes from

I wanted to watch a vault grow as a sky instead of a flat graph. Built with [Claude Code](https://claude.com/claude-code).

## License

MIT
