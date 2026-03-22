/**
 * Wrapper for `window.spark.llmPrompt`: Spark types the first argument as `string[]`,
 * but tagged templates pass `TemplateStringsArray`.
 */
export function sparkLlmPrompt(
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  return window.spark.llmPrompt(strings as unknown as string[], ...values)
}
