import { IsBoolean, IsNotEmpty, IsString } from 'class-validator'

export class UpdateActivityDto {
	@IsString()
	@IsNotEmpty()
	telegramId!: string

	@IsBoolean()
	isOnline!: boolean
}
