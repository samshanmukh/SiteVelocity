/**
 * Node module-hook that stubs CSS-module imports during contract tests.
 * Each accessed class name resolves to itself, so class-based assertions
 * remain possible while no CSS pipeline is required.
 */
const CSS_SOURCE =
  "export default new Proxy({}, { get: (t, p) => (typeof p === \"string\" ? p : \"\") });";

export function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith(".css")) {
    return {
      url: `data:text/javascript,${encodeURIComponent(CSS_SOURCE)}`,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
