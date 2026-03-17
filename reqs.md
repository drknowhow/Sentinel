# Sentinel: Web Application Tester & Guide Creator

## Description
**Sentinel** is a Chromium-based browser extension (Chrome/Edge) designed to streamline quality assurance and onboarding. It allows users to record their interactions with web applications to automatically generate step-by-step HTML guides (complete with screenshots) and playback these recorded sessions for automated end-to-end testing.

## Primary Goal
To build a lightweight, performant extension using Manifest V3 that reduces the manual effort required for web app documentation and UI testing, ensuring reliable playback and clean, readable exports.

## Core Requirements
* **Environment:** Chromium browsers (Google Chrome, Microsoft Edge).
* **Architecture:** Manifest V3.
* **Tech Stack:** React (UI/Popup), JavaScript/TypeScript, HTML/CSS.
* **Permissions:** `activeTab`, `storage`, `scripting`, `downloads`, `tabs`.
* **Key Modules:**
    * *Tracker/Guide Creator:* Captures DOM events, generates robust CSS/XPath selectors, and takes visible tab screenshots.
    * *Testing Engine:* Parses recorded JSON steps, simulates user inputs, evaluates assertions, and outputs pass/fail logs.

---

## Implementation Phases & To-Dos

### Phase 1: Skeleton & State Management
**Description:** Laying the groundwork. This phase focuses on getting the basic extension files in place and ensuring all the different parts of the extension can talk to each other.
**Goal:** Set up the foundational architecture, build pipeline, and establish communication between extension components.

- [ ] Initialize repository and configure build tools (e.g., Vite or Webpack).
- [ ] Create `manifest.json` (Manifest V3) with required permissions.
- [ ] Scaffold the React popup UI with basic "Start Recording" and "Stop Recording" controls.
- [ ] Set up the Service Worker (Background Script) to manage the extension's background state.
- [ ] Implement message-passing listeners and dispatchers between the Popup, Background Script, and Content Scripts.

### Phase 2: Action Tracking & DOM Interaction
**Description:** The core recording engine. This phase involves listening to what the user does on the web page and translating those physical actions into code-readable data.
**Goal:** Inject scripts into web pages to accurately capture user interactions and translate them into reliable, reusable selectors.

- [ ] Write logic to dynamically inject Content Scripts into the user's active tab.
- [ ] Add global event listeners in the Content Script (`click`, `input`, `keydown`).
- [ ] Develop a robust selector-generation function (must handle dynamic IDs, classes, and deep tag hierarchies to avoid brittle tests).
- [ ] Create a structured JSON format for logging actions (e.g., event type, target selector, timestamp, input value).
- [ ] Implement `chrome.storage.local` logging to temporarily save the recorded session data.

### Phase 3: Visual Capture & Guide Export
**Description:** The documentation builder. This phase links the recorded actions to screenshots and packages everything into a user-friendly, downloadable file.
**Goal:** Combine recorded actions with visual context and export them as a standalone, formatted HTML document.

- [ ] Implement screenshot capture via `chrome.tabs.captureVisibleTab` in the Background Script, triggered by significant Content Script events.
- [ ] Design a lightweight HTML/CSS template string for the generated visual guide.
- [ ] Write an export compiler that maps the JSON action array and base64 screenshot strings into the HTML template.
- [ ] Integrate the `chrome.downloads` API to trigger a local save prompt for the generated `.html` file.

### Phase 4: Test Playback & Assertions
**Description:** The testing engine. This phase allows the extension to read the recorded data and mimic the user's actions autonomously, checking for specific conditions along the way.
**Goal:** Enable the playback of recorded sessions and allow users to define expected application states for automated QA.

- [ ] Update the UI to include an "Add Assertion" mode (pauses recording so the user can select an element and define a requirement, like "must be visible").
- [ ] Write a playback loop in the Content Script that parses the saved JSON steps and programmatically dispatches events (simulating clicks and typing).
- [ ] Implement visual feedback during playback (e.g., drawing a temporary red border around the target element being interacted with).
- [ ] Build the assertion evaluation logic (e.g., reading DOM state to verify text content or visibility).
- [ ] Generate a final pass/fail report UI upon completion of the automated test run.