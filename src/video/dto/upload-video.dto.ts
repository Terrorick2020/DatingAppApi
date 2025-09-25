import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class UploadVideoDto {
	@IsString()
	@IsNotEmpty()
	telegramId: string
}

export class SaveVideoDto {
	@IsString()
	@IsNotEmpty()
	key: string

	@IsString()
	@IsNotEmpty()
	telegramId: string

	@IsString()
	@IsOptional()
	title?: string

	@IsString()
	@IsOptional()
	description?: string
}
