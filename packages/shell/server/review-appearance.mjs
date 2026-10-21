/** Render identities contain resolved schemes; app themes must be declared by this project. */
export function checkedAppearance(value, project) {
  const fail = () => { throw Object.assign(Error('Invalid or undeclared preview appearance'), { status: 400 }) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail()
  if (value.theme !== undefined && !['light', 'dark'].includes(value.theme)) fail()
  if (value.appearance !== undefined && !['system', 'light', 'dark'].includes(value.appearance)) fail()
  if (value.appearance && value.appearance !== 'system' && value.theme && value.appearance !== value.theme) fail()
  if (value.appTheme !== undefined && (typeof value.appTheme !== 'string' || !project?.appearance?.themes?.some(theme => theme.id === value.appTheme))) fail()
  return { ...(value.theme !== undefined ? { theme: value.theme } : {}), ...(value.appTheme !== undefined ? { appTheme: value.appTheme } : {}) }
}
