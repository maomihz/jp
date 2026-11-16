export function createCurriculumStore(baseUrl = "./data", fetchFn = globalThis.fetch) {
  let manifestCache = null;
  let matricesCache = null;
  const unitCache = new Map();
  const lessonIndex = new Map();

  async function fetchJson(relativePath) {
    const response = await fetchFn(`${baseUrl}/${relativePath}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${relativePath}: HTTP ${response.status}`);
    }
    return response.json();
  }

  async function loadManifest() {
    if (manifestCache) return manifestCache;
    const manifest = await fetchJson("manifest.json");
    manifestCache = manifest;
    lessonIndex.clear();
    for (const unit of manifest.units ?? []) {
      for (const lesson of unit.lessons ?? []) {
        lessonIndex.set(lesson.lesson_id, unit);
      }
    }
    return manifest;
  }

  async function loadUnit(unitNumber) {
    if (unitCache.has(unitNumber)) return unitCache.get(unitNumber);
    const manifest = await loadManifest();
    const unitMeta = manifest.units.find((u) => u.unit_number === unitNumber);
    if (!unitMeta) {
      throw new Error(`Unknown unit number: ${unitNumber}`);
    }
    const unitData = await fetchJson(unitMeta.unit_file);
    unitCache.set(unitNumber, unitData);
    return unitData;
  }

  async function loadLesson(lessonId) {
    await loadManifest();
    const unitMeta = lessonIndex.get(lessonId);
    if (!unitMeta) return null;
    const unitData = await loadUnit(unitMeta.unit_number);
    const lesson = unitData.lessons.find((ls) => ls.lesson_id === lessonId);
    if (!lesson) return null;
    return { unit: unitData, lesson };
  }

  async function loadMatrices() {
    if (matricesCache) return matricesCache;
    const data = await fetchJson("matrices.json");
    matricesCache = data.matrices ?? [];
    return matricesCache;
  }

  async function loadMatrix(matrixId) {
    const matrices = await loadMatrices();
    return matrices.find((item) => item.matrix_id === matrixId) ?? null;
  }

  return {
    loadManifest,
    loadUnit,
    loadLesson,
    loadMatrices,
    loadMatrix,
  };
}
