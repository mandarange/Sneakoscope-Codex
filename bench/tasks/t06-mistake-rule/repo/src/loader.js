export async function loadJson(readText) {
  try {
    return JSON.parse(await readText());
  } catch (err) {}
  return null;
}
