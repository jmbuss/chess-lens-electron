export type PlatformType = 'chess.com'

export interface PlatformAccountData {
  id?: number
  userId: number
  platform: PlatformType
  platformUsername: string
  createdAt?: string
  updatedAt?: string
}
