const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function compareProjects(original, rebuilt) {
  const problems = [];

  if (original.length !== rebuilt.length) {
    problems.push(`cantidad distinta: se esperaban ${original.length} proyectos y hay ${rebuilt.length}`);
  }

  for (const [index, before] of original.entries()) {
    const after = rebuilt[index];
    if (!after) {
      problems.push(`falta el proyecto ${before.id}`);
      continue;
    }

    if (before.id !== after.id) {
      problems.push(`orden distinto: en la posición ${index} se esperaba ${before.id} y hay ${after.id}`);
      continue;
    }

    for (const key of ["type", "title", "description", "images"]) {
      if (!sameValue(before[key], after[key])) {
        problems.push(
          `${before.id}.${key} cambió: ` +
            `${JSON.stringify(before[key])} != ${JSON.stringify(after[key])}`,
        );
      }
    }
  }

  return problems;
}

export function formatProjectProblems(problems) {
  if (problems.length === 0) {
    return {
      ok: true,
      message: "OK: los proyectos reconstruyen exactamente el contenido original.",
    };
  }

  const details = problems.slice(0, 30).map((problem) => `  - ${problem}`);
  if (problems.length > 30) {
    details.push(`  ... y ${problems.length - 30} más`);
  }

  return {
    ok: false,
    message: [`FALLO: ${problems.length} problema(s)`, "", ...details].join("\n"),
  };
}
