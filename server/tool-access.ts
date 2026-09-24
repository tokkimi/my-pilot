import type { User } from './platform.js'
import type { ToolAccess } from '../src/lib/types.js'
export function canUseTool(user: User, tool: keyof ToolAccess, manage = false) {
  if (user.role === 'admin' || user.role === 'superadmin') return true
  const access = user.toolAccess?.[tool] ?? 'none'
  return manage ? access === 'manage' : access === 'read' || access === 'manage'
}
