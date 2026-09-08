import { z } from 'zod'

export const RuntimeInfoSchema = z.object({
  appName: z.string(),
  appVersion: z.string(),
  electronVersion: z.string(),
  chromeVersion: z.string(),
  nodeVersion: z.string(),
  platform: z.string(),
  arch: z.string(),
  locale: z.string(),
  isPackaged: z.boolean(),
  isDevelopment: z.boolean(),
  paths: z.object({
    userData: z.string(),
    logs: z.string(),
    archiveData: z.string(),
    resources: z.string()
  })
})
export type RuntimeInfo = z.infer<typeof RuntimeInfoSchema>

export const WindowStateSchema = z.object({
  isMaximized: z.boolean(),
  isFullScreen: z.boolean(),
  isFocused: z.boolean()
})
export type WindowState = z.infer<typeof WindowStateSchema>
