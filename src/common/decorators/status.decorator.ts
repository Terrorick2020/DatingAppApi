import { SetMetadata } from '@nestjs/common'

export const STATUS_KEY = 'status'
export const Status = (...statuses: string[]) => SetMetadata(STATUS_KEY, statuses)