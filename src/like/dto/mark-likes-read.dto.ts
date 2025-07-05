import { IsString } from 'class-validator'

export class MarkLikesReadDto {
	@IsString()
	telegramId: string
}
