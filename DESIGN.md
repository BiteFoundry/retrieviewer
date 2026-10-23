---
name: Retrieviewer
description: A little company for your screen, by BiteFoundry.
colors:
  ground: "#080a09"
  surface: "#111512"
  ink: "#f0f2ed"
  muted: "#a2aaa4"
  line: "#303a32"
  leaf: "#c9e7b9"
  leaf-hover: "#e2f4d8"
typography:
  display:
    fontFamily: "Manrope, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    fontSize: "clamp(2.8rem, 4.9vw, 4.4rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Manrope, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    fontSize: "clamp(2rem, 3.5vw, 3rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Manrope, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "Manrope, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.7
  code:
    fontFamily: "JuliaMono, monospace"
    fontSize: ".84rem"
    fontWeight: 400
    lineHeight: 1.7
rounded:
  language-option: "5px"
  copy: "6px"
  control: "8px"
  note: "12px"
spacing:
  control-gap: "8px"
  control-inline: "16px"
  note-padding: "24px"
  section-gap: "48px"
components:
  button-primary:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.ground}"
    rounded: "{rounded.control}"
    padding: "13px 22px"
  button-primary-hover:
    backgroundColor: "{colors.leaf-hover}"
    textColor: "{colors.ground}"
  button-play:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-play-hover:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.ground}"
  button-subtle:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-copy:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.copy}"
    padding: "8px 12px"
  language-option:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.language-option}"
    padding: "4px 10px"
  language-option-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
  remote-note:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.note}"
    padding: "24px"
---

# Design System: Retrieviewer

## Overview

**Creative North Star: "A little company for your screen"**

The existing system gives the fluffy monochrome Braille retriever room to be seen. Near-black negative space, off-white text and pale leaf-green actions frame the approved Q5 artwork. Plain controls and generous section spacing keep the puppy and practical instructions readable.

This document records the implementation in `docs/index.html`, `docs/style.css` and `docs/app.mjs`, grounded in PRODUCT.md and the current site brief. The North Star reuses the page's existing promise; it is not a new identity proposal.

**Key Characteristics:**

- Fluffy monochrome Braille artwork against dark space.
- Leaf-green actions and flat, lightly bordered controls.
- Self-hosted Manrope text and JuliaMono code and art.
- English and Korean content with responsive reflow.

## Colors

The palette is a dark green-tinted neutral field with one pale green action family. Frontmatter values match the CSS custom properties.

### Primary

- **Leaf:** installation action, links, numbered steps, note headings and keyboard focus.
- **Leaf hover:** brighter installation-action background on hover.

### Neutral

- **Ground:** page background and text on filled controls.
- **Surface:** inset guidance and expanded code backgrounds.
- **Ink:** headings, body text, monochrome artwork and the initial Play action.
- **Muted:** supporting copy, inactive language options and copy labels.
- **Line:** section rules, command rows and control borders.

## Typography

Manrope is self-hosted for interface text, with Apple SD Gothic Neo and Malgun Gothic fallbacks for Korean. JuliaMono is self-hosted for commands and Braille; its fixed metrics preserve the art's proportions.

The frontmatter records the default desktop hierarchy. Introductory copy is larger (18px), while supporting copy and status lines use smaller text (12–15px). Paragraphs default to a maximum width (70ch); the hero introduction is narrower (36ch).

Korean headings use keep-all wrapping, a slightly tighter tracking (-0.04em) and a more open display line height (1.23). Their default display size is `clamp(2.8rem, 4.4vw, 4rem)`. English and Korean display sizes have separate tablet and mobile overrides in the stylesheet; preserve both when changing headings. Braille size and line height are measured by the runtime to fit its stage, rather than using the prose scale.

## Layout

The centered content width caps at 1240px, with a total viewport inset of 96px. At widths of 900px or less that inset becomes 48px; at 620px or less it becomes 40px.

Desktop uses a two-column hero (0.9fr / 1.1fr), with aligned two-column information sections below. Section rules and substantial vertical padding organize the page. The inset note and support rows also use columns. At the mobile breakpoint, the hero, information sections and support rows stack; hero copy centers, the footer becomes a vertical flow and the GitHub header link hides. Language controls remain visible.

The art stage is clipped and centered, with heights of 400px by default, 460px from 1550px, 340px at the tablet breakpoint and 320px on mobile. Play controls wrap. Commands can wrap anywhere and retain a separate copy action. Preserve these behaviors for Korean text and narrow screens.

## Elevation & Depth

The page has no box shadows, gradients or backdrop blur. Depth comes from Ground versus Surface, thin Line borders and open space. The retriever sits directly in the dark stage, with no fabricated desktop-window frame. Buttons move down by one pixel when pressed; reduced-motion preferences remove that displacement and smooth scrolling. There are no timed CSS transitions in the current interface.

## Shapes

Controls use compact rounded rectangles: Control for action and language-group outlines, Language option inside the group and Copy for command actions. The remote guidance note uses the larger Note radius. Section boundaries and support rows remain straight horizontal rules. Preserve the approved retriever proportions, fixed-camera perspective and grounded movement.

## Components

### Buttons

The installation action is Leaf-filled with dark text. Play begins Ink-filled and becomes Leaf on hover; ball, treat and pause use the outlined transparent variant. Standard action controls have a minimum height (44px); tablet play controls briefly use 42px before returning to 44px on mobile. Copy is a smaller label within a 44px-high target.

Keyboard focus uses a Leaf outline (2px) offset from the control (5px). Disabled buttons retain their shape with reduced opacity (0.42) and a not-allowed cursor. Preserve semantic button and link roles. Button press feedback is one pixel; reduced motion disables it.

### Navigation

The dot emblem, BiteFoundry name, GitHub link and bordered EN / 한국어 group form a compact horizontal header. The selected language option inverts to Ink on Ground-colored text and exposes `aria-pressed`. Changing language updates page text, accessible labels and the document language. Mobile removes the extra product suffix and GitHub header link to preserve room for language controls.

### Containers and disclosures

The remote-display guidance is a Surface note with a Leaf heading and Muted explanation. Its two columns collapse at the tablet breakpoint; padding decreases from Note padding to 20px on mobile. Commands and support information use divided rows rather than a card grid. Native `details` / `summary` disclosures keep prerequisites, npx / PATH help and removal instructions available without expanding the main flow. Summaries use a Leaf marker and a minimum height (58px).

### Retriever preview

The signature component is a real engine preview rendered as monochrome Braille text in JuliaMono. A still preview appears before the visitor requests play; runtime assets load on Play. Keep ball, treat, pause / resume, retry and polite status feedback connected to the engine's actual state. The artwork is hidden from text reading while the stage has a localized accessible description. Preserve the distinction between the browser preview and the installed window-following companion.

### Website copy refresh (0.0.9)

Keep the introduction personal and brief: a dog made to keep a terminal company.
The two-command install includes choosing a window and clicking Attach; a quiet
note explains that desktop controls use English even on the Korean website.
Current-release notes stay small beside installation, with technical measurements
linked rather than promoted as a memory guarantee. The existing EN/KO controls,
palette and still-sleep previews remain; no new media or runtime is added.

## Do's and Don'ts

### Do:

- Do preserve the approved fluffy monochrome Braille art and its dark negative space.
- Do use the existing Leaf and neutral roles, self-hosted fonts and flat control shapes.
- Do retain visible EN / 한국어 controls, keyboard focus and readable disabled states.
- Do keep the two primary install commands prominent and put prerequisite guidance alongside them.
- Do preserve mobile wrapping, Korean heading treatment and real preview state feedback.

### Don't:

- Don't substitute generic 3D or voxel artwork for the approved retriever.
- Don't add a fabricated OS or agent window around the browser demonstration.
- Don't imply that remote SSH installation targets the local display automatically, or that npx permanently configures PATH.
- Don't present unverified platform support or an account, telemetry or model API requirement that the product does not have.
