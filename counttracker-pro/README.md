# CountTracker Pro

A premium, responsive, frontend-only counting application built with HTML, CSS, and vanilla JavaScript. 

It tracks user sessions, milestones, streaks, and full history using IndexedDB for persistent in-browser storage.

## How to Run

Because the application has been optimized to run locally without a server, you can launch it instantly:

1. Open the `counttracker-pro` folder.
2. Double-click `index.html` to open it in your browser.

**No local server (Live Server, Node, Python, etc.) is required!** All JavaScript code is loaded sequentially using standard script tags, allowing full IndexedDB offline support directly from the `file://` protocol.

## Major Features

* **Complete Authentication:** Register and log in using hashed passwords stored via the Web Crypto API.
* **Intelligent Counting System:** Track sessions, time taken, and dynamic milestones (10, 25, 50, 100).
* **Robust History:** Browse all past sessions, filter by timeframes, and see duration constraints.
* **Deep Analytics:** Visualize your counting habits with Chart.js (daily counts, weekly averages, streaks).
* **Data Portability:** Export your entire history as JSON, or import previous backups.
* **Premium UI/UX:** Responsive layouts, mobile bottom-navigation, toasts, modals, and seamless dark/light mode toggle.

## Storage Design (LocalStorage)

The database wrapper (`db.js`) uses normalized JSON arrays saved to `localStorage` to ensure speed and simplicity without relying on external databases. 

- `users`: `{ id, username, passwordHash, createdAt, settings }`
- `sessions`: `{ id, userId, startedAt, endedAt, startCount, endCount, status }`
- `sessionEvents`: Detailed granular increments `{ id, userId, sessionId, type, countAfterEvent }`
- `dailyStats`: Derived fast-access cache `{ id, date, totalCount, sessionsCount }`
- `milestoneCache`: Fast milestone retrieval per session.

*No backend frameworks or DBs were used.*
