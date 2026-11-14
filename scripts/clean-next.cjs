// Clears Next's build cache before the app starts (D99). After the app has been stopped and the data
// file swapped, a stale cache made the first page fail on Paul's machine with "ArrayBuffer is not
// detachable and could not be cloned"; deleting .next fixed it every time. Costs about 10 seconds
// on the first page load.
require("node:fs").rmSync(require("node:path").join(__dirname, "..", ".next"), { recursive: true, force: true });
