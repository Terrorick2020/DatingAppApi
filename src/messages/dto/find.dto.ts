import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator'
import { Type } from 'class-transformer'

export class FindDto {
	@IsString()
	@IsNotEmpty()
	chatId!: string

	@IsOptional()
	@IsNumber()
	@Type(() => Number)
	limit?: number

	@IsOptional()
	@IsNumber()
	@Type(() => Number)
	offset?: number
}
