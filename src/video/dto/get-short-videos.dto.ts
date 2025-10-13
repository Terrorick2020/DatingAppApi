import { Transform } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

export class GetShortVideosDto {
	@IsString()
	telegramId: string

	@IsOptional()
	@Transform(({ value }) => parseInt(value))
	@IsInt()
	@Min(1)
	@Max(50)
	limit?: number = 10

	@IsOptional()
	@Transform(({ value }) => parseInt(value))
	@IsInt()
	@Min(0)
	offset?: number = 0

	@IsOptional()
	@IsString()
	search?: string
}
