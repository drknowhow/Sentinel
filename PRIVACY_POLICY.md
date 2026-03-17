# Privacy Policy — Sentinel Browser Extension

**Last updated:** March 17, 2026

## Overview

Sentinel is a browser extension that records user interactions with web pages to generate visual guides, run playback tests, and track bugs. This privacy policy explains what data Sentinel handles and how it is stored.

## Data Collection

Sentinel does **not** collect, transmit, or share any personal data. All data processed by the extension remains entirely on your local machine.

### Data Stored Locally

When you use Sentinel, the following data is saved to your browser's local extension storage (`chrome.storage.local`):

- **Recorded actions** — click targets, input values, scroll positions, CSS selectors, and timestamps captured during recording sessions.
- **Screenshots** — JPEG images of the visible browser tab, taken automatically during recording or when saving bug reports.
- **Bug reports and feature requests** — user-created issue titles, notes, severity levels, page URLs, and associated element selectors.
- **Error logs** — JavaScript console errors, unhandled exceptions, failed network request URLs and status codes, and CSP violations captured while error tracking is enabled.
- **Video clips** — WebM recordings of the active browser tab, stored temporarily in memory until downloaded or discarded.
- **Session metadata** — session names, creation timestamps, and user preferences (playback speed, step-by-step mode).

### Data NOT Collected

- No personal information (name, email, account details)
- No browsing history beyond the pages you actively record
- No cookies or authentication tokens
- No analytics, telemetry, or usage statistics

## Data Transmission

Sentinel makes **zero network requests**. No data is sent to any server, third party, or external service. The extension does not contain any analytics, tracking, or telemetry code.

## Data Storage & Retention

All data is stored locally in your browser using the `chrome.storage.local` API. Data persists until you:

- Delete individual sessions or issues within the extension
- Clear the extension's storage through your browser settings
- Uninstall the extension

## Data Export

You may choose to export data as:

- **HTML guide files** — self-contained documents with embedded screenshots
- **HTML issue reports** — styled bug/feature reports with embedded screenshots
- **JSON files** — structured session or issue data (without screenshots)
- **WebM video files** — recorded tab video clips

Exported files are saved to your local filesystem via your browser's download prompt. No data is uploaded during export.

## Permissions

Sentinel requests the following browser permissions:

| Permission | Purpose |
|---|---|
| `activeTab` | Access the current tab to record user actions and capture screenshots |
| `storage` | Save recorded sessions, issues, and preferences locally |
| `scripting` | Inject the recording and playback scripts into web pages |
| `downloads` | Save exported guides, reports, and video files to your computer |
| `tabs` | Identify the active tab for recording and open the guide editor |
| `sidePanel` | Display the Sentinel interface in Chrome's side panel |
| `tabCapture` | Record video of the active browser tab |

## Third-Party Services

Sentinel does not integrate with or send data to any third-party services.

## Changes to This Policy

If this privacy policy is updated, the changes will be noted with an updated "Last updated" date at the top of this document.

## Contact

If you have questions about this privacy policy, please open an issue at the project's GitHub repository.
