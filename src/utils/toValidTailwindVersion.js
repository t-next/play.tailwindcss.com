export function toValidTailwindVersion(value, defaultVersion = '2') {
  if (['1', '2', '3'].includes(value)) return value
  return defaultVersion
}
