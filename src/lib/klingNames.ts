// Kling Element names (D127, D128): Kling's 20-character name box, with the project's code first
// so the Elements sort by project ("POT Jade", "SKA Kai") and the app can group them.

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** A name in Kling's 20 characters, cut at a word. */
export const nameOf = (s: string, code = "") => {
  // The project's code first (D128), so Kling's list sorts by project: "POT Jade", "SKA Kai".
  const t = clean(code ? `${code} ${s}` : s);
  if (t.length <= 20) return t;
  const cut = t.slice(0, 20);
  return (cut.slice(0, cut.lastIndexOf(" ")) || cut).replace(/[-–,:;]+$/, "");
};

/** Whether a Kling Element's name says it belongs to the project with this code (D128). */
export const ofProject = (name: string, code: string) => new RegExp(`^${code.replace(/[^A-Za-z0-9]/g, "")}(?:[\\s_·:-]|$)`, "i").test(name.trim());

