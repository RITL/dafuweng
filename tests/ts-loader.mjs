export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const isRelativeWithoutExtension =
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !/\.[a-z0-9]+$/i.test(specifier);

    if (!isRelativeWithoutExtension) throw error;
    return nextResolve(`${specifier}.ts`, context);
  }
}
