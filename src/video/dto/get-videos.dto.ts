import { Transform } from 'class-transformer'
import {
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	Max,
	Min,
} from 'class-validator'

export class GetMyVideosDto {
	@IsString()
	@IsNotEmpty()
	telegramId: string

	@IsOptional()
	@Transform(({ value }) => parseInt(value))
	@IsNumber()
	@Min(1)
	@Max(50)
	limit?: number = 10

	@IsOptional()
	@Transform(({ value }) => parseInt(value))
	@IsNumber()
	@Min(0)
	offset?: number = 0
}

export class GetPublicVideosDto {
	@IsOptional()
	@Transform(({ value }) => parseInt(value))
	@IsNumber()
	@Min(1)
	@Max(50)
	limit?: number = 10

	@IsOptional()
	@Transform(({ value }) => parseInt(value))
	@IsNumber()
	@Min(0)
	offset?: number = 0

	@IsOptional()
	@IsString()
	search?: string
}
