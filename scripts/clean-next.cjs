// Clears Next's build cache before the app starts (D99). After the app has been stopped and the data
// file swapped, a stale cache made the first page fail on Paul's machine with "ArrayBuffer is not
// detachable and could not be cloned"; deleting .next fixed it every time. Costs about 10 seconds
// on the first page load. Never stops the app starting: if Windows still has a file in .next open,
// it says so and carries on.
const path = require("node:path");
const fs = require("node:fs");
try {
  fs.rmSync(path.join(__dirname, "..", ".next"), { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
} catch (e) {
  console.warn(`Couldn't clear the build cache (${e && e.code ? e.code : e}); starting anyway.`);
}
